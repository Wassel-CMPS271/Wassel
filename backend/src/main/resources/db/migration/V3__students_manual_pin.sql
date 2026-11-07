-- SCRUM-211: manual_pin is true once a person (not the geocoder) set the student's map pin, after which
-- saving a new address never overwrites it. Existing students' pins were all set by hand or not at all
-- before geocoding existed, but a false default is the safe one: the next address change geocodes
-- them as it would any new student.

ALTER TABLE students ADD COLUMN manual_pin boolean NOT NULL DEFAULT false;
