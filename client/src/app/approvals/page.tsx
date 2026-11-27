import { redirect } from "next/navigation";

export default function LegacyApprovalsRedirect() {
  redirect("/admin/approvals");
}
