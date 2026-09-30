import { NextRequest, NextResponse } from 'next/server'

// Provider-neutral webhook scaffold.
// The AI/provider adapter should POST a normalized request here:
// { phone, name, note, items:[{product_code,qty,unit}] }
export async function POST(req:NextRequest){
  try{
    const body=await req.json()
    if(!body?.phone || !Array.isArray(body.items)) return NextResponse.json({error:'Invalid payload'},{status:400})
    // TODO: resolve product codes and insert PENDING request in Supabase.
    // Deliberately no stock mutation happens in this endpoint.
    return NextResponse.json({ok:true,status:'PENDING',warehouse:'GUDANG_TRANSIT',message:'Request diterima dan menunggu approval admin.'})
  }catch{ return NextResponse.json({error:'Invalid JSON'},{status:400}) }
}
