import { ParentTransportRecordsPage } from "../../../ParentTransportRecordsPage";

// The parent layout enforces PARENT role; the client verifies linkage and
// the backend authorizes each per-child request against the cookie session.
export default async function ChildRecordsPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  return <ParentTransportRecordsPage studentId={studentId} />;
}
