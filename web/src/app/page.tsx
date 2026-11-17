import { redirect } from "next/navigation";
import { currentUser } from "@/lib/security/session";

export const instant = false;

export default async function Home() { redirect((await currentUser()) ? "/dashboard" : "/login"); }
