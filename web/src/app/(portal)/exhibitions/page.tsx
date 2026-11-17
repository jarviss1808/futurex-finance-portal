import { currentActor } from "@/lib/security/session";
import { db } from "@/lib/db";
import Image from "next/image";
import { redirect } from "next/navigation";
import "./exhibitions.css";

const date = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

export default async function ExhibitionsPage() {
  const actor = await currentActor();
  if (!actor) redirect("/login");
  const events = await db.event.findMany({ where: { organizationId: actor.organizationId, type: "OWNED", posterImageKey: "futurex-upcoming-exhibitions-2026-2028", endsOn: { gte: new Date() } }, orderBy: { startsOn: "asc" } });
  return <><header className="page-head"><div><p className="eyebrow">FUTUREX GROUP</p><h1>Upcoming exhibitions</h1><p>Owned exhibition details from the supplied poster. Tax approval remains a separate accounting control.</p></div></header><section className="panel poster-panel"><Image src="/api/branding/upcoming-exhibitions-poster" width={2481} height={3508} sizes="(max-width: 700px) 100vw, calc(100vw - 244px)" alt="Futurex Group upcoming exhibitions poster with expo logos, dates and venues" /></section><section className="exhibition-grid">{events.map(event=><article className="panel exhibition-card" key={event.id}><div><span className="badge issued">OWNED</span>{event.edition&&<span className="edition">{event.edition}</span>}</div><h2>{event.name}</h2><strong>{date.format(event.startsOn)} - {date.format(event.endsOn)}</strong><p>{event.venue}<br/>{event.city}{event.stateRegion?`, ${event.stateRegion}`:""} · {event.countryCode}</p>{event.website&&<a href={event.website} target="_blank" rel="noreferrer">Official website</a>}<small>{event.taxConfigApproved?"Tax configuration approved":"Tax configuration needs accountant approval"}</small></article>)}</section></>;
}
