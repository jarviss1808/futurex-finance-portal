import { currentActor } from "@/lib/security/portal";
import { listVisibleClients } from "@/lib/clients/repository";
import { ClientForm } from "./client-form";
import { ClientEditor } from "./client-editor";

export default async function ClientsPage() {
  const actor = (await currentActor())!;
  const admin = actor.role === "ADMIN";
  const clients = await listVisibleClients(actor);
  const missingEmail = clients.filter((client) => !client.contactEmail).length;
  return <>
    <header className="page-head"><div><p className="eyebrow">{admin ? "ALL CLIENT RELATIONSHIPS" : "MY CLIENTS"}</p><h1>Clients</h1><p>{admin ? "Every employee's client relationships. The same company can be handled by more than one employee." : "Only you can see your client contacts. A client can take part in any number of exhibitions — create a separate PI for each."}</p></div></header>
    {missingEmail > 0 && <div className="notice warning">{missingEmail} client{missingEmail > 1 ? "s have" : " has"} no email address, so PI emails and payment reminders cannot be sent to them. Open the client below and add it.</div>}
    <section className="split">
      <div className="panel"><h2>Add a client</h2><ClientForm /></div>
      <div className="panel"><div className="panel-head"><h2>{admin ? "All clients" : "My clients"}</h2><span className="count">{clients.length}</span></div><div className="client-list">{clients.map((client) => <ClientEditor key={client.id} client={client} owner={admin ? client.owner.name : undefined} />)}{!clients.length && <p className="empty">No clients yet. Add your first client to start creating PIs.</p>}</div></div>
    </section>
  </>;
}
