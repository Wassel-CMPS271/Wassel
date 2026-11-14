package com.wassel.backend.reports.service;

import com.wassel.backend.absences.service.AbsenceService;
import com.wassel.backend.reports.dto.DayTotals;
import com.wassel.backend.reports.dto.Totals;
import com.wassel.backend.reports.dto.TransportTotalsResponse;
import com.wassel.backend.reports.exception.InvalidTotalsRangeException;
import com.wassel.backend.runs.dto.DailyRunTotals;
import com.wassel.backend.runs.service.RunService;
import com.wassel.backend.students.service.StudentService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * The transport totals and their CSV export (SCRUM-271, docs/contracts/transport-totals.md). The school always comes
 * from the authenticated user. The export is built from the same {@link TransportTotalsResponse} as the JSON, so the
 * two cannot disagree.
 */
@Service
@RequiredArgsConstructor
public class ReportService {

	/** The most dates one request may cover, both ends included. */
	static final int MAX_DAYS = 62;

	private static final String CSV_HEADER = "date,runs,runsFinished,pickedUp,droppedOff,notPresent,absent";

	private final RunService runService;

	private final AbsenceService absenceService;

	private final StudentService studentService;

	private final Clock clock;

	/**
	 * The totals for the range, today when {@code from} is null and {@code from} when {@code to} is null. Every date
	 * of the range is listed. Not {@code @Transactional}: it is three separate reads, each in its own short
	 * transaction.
	 */
	public TransportTotalsResponse totals(UUID schoolId, LocalDate from, LocalDate to) {
		LocalDate start = from == null ? LocalDate.now(clock) : from;
		LocalDate end = to == null ? start : to;
		if (end.isBefore(start)) {
			throw new InvalidTotalsRangeException("to", "To must not be before from");
		}
		if (ChronoUnit.DAYS.between(start, end) + 1 > MAX_DAYS) {
			throw new InvalidTotalsRangeException("to", "The range may cover at most " + MAX_DAYS + " days");
		}
		Map<LocalDate, DailyRunTotals> runs = runService.dailyTotals(schoolId, start, end).stream()
				.collect(Collectors.toMap(DailyRunTotals::date, Function.identity()));
		Map<LocalDate, Long> absent = absenceService.countAbsentStudentsByDate(schoolId, start, end);
		List<DayTotals> days = new ArrayList<>();
		for (LocalDate date = start; !date.isAfter(end); date = date.plusDays(1)) {
			DailyRunTotals day = runs.getOrDefault(date, new DailyRunTotals(date, 0, 0, 0, 0, 0));
			days.add(new DayTotals(date, day.runs(), day.runsFinished(), day.pickedUp(), day.droppedOff(),
					day.notPresent(), absent.getOrDefault(date, 0L)));
		}
		return new TransportTotalsResponse(start, end, studentService.countOnRoutes(schoolId), sum(days), days);
	}

	/** The same totals as CSV: a header, a row per date and a final {@code TOTAL} row. Numbers and dates only. */
	public String csv(TransportTotalsResponse totals) {
		StringBuilder csv = new StringBuilder(CSV_HEADER).append("\r\n");
		for (DayTotals day : totals.days()) {
			csv.append(day.date()).append(',').append(day.runs()).append(',').append(day.runsFinished()).append(',')
					.append(day.pickedUp()).append(',').append(day.droppedOff()).append(',')
					.append(day.notPresent()).append(',').append(day.absent()).append("\r\n");
		}
		Totals total = totals.total();
		return csv.append("TOTAL,").append(total.runs()).append(',').append(total.runsFinished()).append(',')
				.append(total.pickedUp()).append(',').append(total.droppedOff()).append(',')
				.append(total.notPresent()).append(',').append(total.absent()).append("\r\n").toString();
	}

	private static Totals sum(List<DayTotals> days) {
		return new Totals(days.stream().mapToLong(DayTotals::runs).sum(),
				days.stream().mapToLong(DayTotals::runsFinished).sum(),
				days.stream().mapToLong(DayTotals::pickedUp).sum(),
				days.stream().mapToLong(DayTotals::droppedOff).sum(),
				days.stream().mapToLong(DayTotals::notPresent).sum(),
				days.stream().mapToLong(DayTotals::absent).sum());
	}
}
