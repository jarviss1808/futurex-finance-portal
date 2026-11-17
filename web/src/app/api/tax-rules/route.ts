import { db } from "@/lib/db";
import { currentActor } from "@/lib/security/session";
export async function GET(){const actor=await currentActor();if(!actor)return Response.json({error:"Unauthorized"},{status:401});return Response.json(await db.taxRule.findMany({where:{organizationId:actor.organizationId,approved:true},select:{id:true,name:true,taxType:true,rateBasisPoints:true,placeOfSupplyRule:true},orderBy:{name:"asc"}}),{headers:{"Cache-Control":"private, no-store"}})}
