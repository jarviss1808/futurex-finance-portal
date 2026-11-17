import { z } from "zod";
import { assertSameOrigin } from "@/lib/security/request";
import { currentActor } from "@/lib/security/session";
import { errorResponse } from "@/lib/http";
import { createReceipt } from "@/lib/payments/service";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{assertSameOrigin(request);const actor=await currentActor();if(!actor)return Response.json({error:"Unauthorized"},{status:401});const body=z.object({seriesId:z.string().cuid()}).parse(await request.json());return Response.json(await createReceipt(actor,(await params).id,body.seriesId))}catch(error){return errorResponse(error)}}
