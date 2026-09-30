'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

type Location = 'GUDANG_UTAMA' | 'GUDANG_TRANSIT'
type Product = { id:string; product_code:string; name:string; purchase_unit:string; base_unit:string; conversion_factor:number; conversion_note?:string|null; has_exp:boolean; exp_raw:string|null; category:string|null; barang_tag?:string|null; min_stock:number }
type Stock = { product_id:string; location:Location; qty:number; normalized_qty:number|null; products?:Product }
type Tx = { id:string; product_id:string; location:Location; type:string; qty:number; unit:string; normalized_qty:number|null; note:string|null; transaction_date:string; created_at:string; source?:string; products?:{name:string} }
type Rack = { id:string; rack_code:string; rack_name:string; description:string|null; active:boolean; created_at:string }
type RackProduct = { id:string; rack_id:string; product_id:string; sort_order:number; products:Product }
type Pickup = { id:string; request_no:number; rack_id:string|null; requester_name:string|null; status:string; note:string|null; created_at:string; approved_at:string|null; rejected_at:string|null; rejection_reason:string|null; rack?:Rack|null; pickup_request_items: {id:string;product_id:string;qty:number;unit:string;products:Product}[] }
type OrderRow = { id:string; row_no:number; left_name:string|null; left_uom:string|null; m1:number|null;m2:number|null;m3:number|null;m4:number|null;left_note:string|null; right_no:number|null;right_name:string|null;right_uom:string|null;right_qty:number|null;right_note:string|null }
type Batch = { id:string; product_id:string; batch_code:string|null; exp_date:string; qty:number|null; note:string|null; created_at:string }
type Tab='dashboard'|'transfer'|'inventory'|'history'|'approval'|'qr'|'orders'|'reports'

const nav: [Tab,string,string][] = [
 ['dashboard','Dashboard','Ringkasan operasional'],
 ['transfer','Transfer Gudang','Utama → Transit'],
 ['inventory','Inventory','Gudang & transaksi'],
 ['history','History','Riwayat usage & pengeluaran'],
 ['approval','Approval Pengambilan','Request dari QR Rak'],
 ['qr','QR Rak','Rak & QR pengambilan'],
 ['orders','Orderan Mingguan','Format Excel'],
 ['reports','Laporan','Ringkasan & export']
]
const ADMINS = [{id:'taufiq',password:'admin123'},{id:'rizki',password:'admin321'}]
const fmt=(n:any)=>n===null||n===undefined||n===''?'—':Number(n).toLocaleString('id-ID',{maximumFractionDigits:2})
const locLabel=(l:Location)=>l==='GUDANG_UTAMA'?'Gudang Utama':'Gudang Transit'
const typeLabel=(t:string)=>({IN:'Penambahan',OUT:'Pengeluaran',USAGE:'Usage',SPOIL:'Rusak / Spoil',ADJUSTMENT:'Adjustment',OPENING:'Opening',TRANSFER_IN:'Transfer Masuk',TRANSFER_OUT:'Transfer Keluar'} as Record<string,string>)[t]||t
const typeBadgeClass=(t:string):string=>({IN:'ok',OPENING:'ok',TRANSFER_IN:'ok',OUT:'bad',USAGE:'bad',SPOIL:'bad',TRANSFER_OUT:'warn',ADJUSTMENT:'neutral'} as Record<string,string>)[t]||'neutral'

export default function Home(){
 const [tab,setTab]=useState<Tab>('dashboard'), [location,setLocation]=useState<Location>('GUDANG_UTAMA'), [inventoryCategory,setInventoryCategory]=useState<'Usage'|'Weekly'|'Produk Biasa'>('Usage')
 const [products,setProducts]=useState<Product[]>([]), [stocks,setStocks]=useState<Stock[]>([]), [allStocks,setAllStocks]=useState<Stock[]>([])
 const [tx,setTx]=useState<Tx[]>([]), [racks,setRacks]=useState<Rack[]>([]), [rackProducts,setRackProducts]=useState<RackProduct[]>([]), [pickups,setPickups]=useState<Pickup[]>([]), [orders,setOrders]=useState<OrderRow[]>([]), [batches,setBatches]=useState<Batch[]>([])
 const [q,setQ]=useState(''), [historyUsageQ,setHistoryUsageQ]=useState(''), [historyWeeklyQ,setHistoryWeeklyQ]=useState(''), [historyTab,setHistoryTab]=useState<'usage'|'weekly'>('usage'), [loading,setLoading]=useState(true), [error,setError]=useState('')
 const [admin,setAdmin]=useState(false), [loginOpen,setLoginOpen]=useState(false), [loginId,setLoginId]=useState(''), [loginPass,setLoginPass]=useState(''), [showPass,setShowPass]=useState(false), [pendingAction,setPendingAction]=useState<(()=>void)|null>(null)
 const [settingsOpen,setSettingsOpen]=useState(false), [accent,setAccent]=useState('#1b1d1f'), [dashboardPhoto,setDashboardPhoto]=useState('')
 const [modal,setModal]=useState<'in'|'out'|'edit'|null>(null), [selected,setSelected]=useState<Stock|null>(null), [selectedTxId,setSelectedTxId]=useState(''), [txDate,setTxDate]=useState(''), [qty,setQty]=useState(''), [unit,setUnit]=useState(''), [outType,setOutType]=useState('OUT'), [note,setNote]=useState(''), [saving,setSaving]=useState(false)
 const [transferProduct,setTransferProduct]=useState(''), [transferQty,setTransferQty]=useState(''), [transferNote,setTransferNote]=useState('')
 const [rackModal,setRackModal]=useState(false), [rackEdit,setRackEdit]=useState<Rack|null>(null), [rackName,setRackName]=useState(''), [rackCode,setRackCode]=useState(''), [rackDesc,setRackDesc]=useState(''), [rackSelected,setRackSelected]=useState<string[]>([]), [qrRack,setQrRack]=useState<Rack|null>(null)
 const [pickupRack,setPickupRack]=useState<Rack|null>(null), [pickupItems,setPickupItems]=useState<Record<string,number>>({}), [requester,setRequester]=useState(''), [pickupNote,setPickupNote]=useState('')
 const [scannerOpen,setScannerOpen]=useState(false), [scanValue,setScanValue]=useState(''), [scanStatus,setScanStatus]=useState<'idle'|'scanning'|'error'>('idle'), [scanError,setScanError]=useState(''), videoRef=useRef<HTMLVideoElement|null>(null), streamRef=useRef<MediaStream|null>(null), canvasRef=useRef<HTMLCanvasElement|null>(null), rafRef=useRef<number|null>(null)
 const [editStockOpen,setEditStockOpen]=useState(false), [editStockTarget,setEditStockTarget]=useState<Stock|null>(null), [editStockQty,setEditStockQty]=useState(''), [editStockExp,setEditStockExp]=useState(''), [editStockSaving,setEditStockSaving]=useState(false)
 const [newBatchCode,setNewBatchCode]=useState(''), [newBatchExp,setNewBatchExp]=useState(''), [newBatchQty,setNewBatchQty]=useState(''), [newBatchNote,setNewBatchNote]=useState(''), [batchSaving,setBatchSaving]=useState(false)
 const [confirmDialog,setConfirmDialog]=useState<{msg:string;action:()=>Promise<void>}|null>(null)
 const [successAnim,setSuccessAnim]=useState(false)

 function askConfirm(msg:string,action:()=>Promise<void>){setConfirmDialog({msg,action})}
 async function runConfirm(){
  if(!confirmDialog)return
  const action=confirmDialog.action
  setConfirmDialog(null)
  await action()
  setSuccessAnim(true)
  setTimeout(()=>setSuccessAnim(false),1800)
 }
 const [orderQ,setOrderQ]=useState('')

 useEffect(()=>{const a=localStorage.getItem('xxi_admin')==='1';setAdmin(a);setAccent(localStorage.getItem('xxi_accent')||'#1b1d1f');setDashboardPhoto(localStorage.getItem('xxi_dashboard_photo')||'')},[])
 useEffect(()=>{
  document.documentElement.style.setProperty('--accent',accent)
  // sidebar: darkened version of accent — pakai color-mix kalau tersedia, fallback manual
  const sidebarMap:Record<string,string>={
   '#1b1d1f':'#111312',
   '#0b6b57':'#074d3e',
   '#1d4ed8':'#1239a8',
   '#8a641b':'#5e4211',
   '#7c3aed':'#5b26c9',
   '#b42318':'#7d1710',
  }
  const sidebar=sidebarMap[accent]||accent
  document.documentElement.style.setProperty('--sidebar',sidebar)
  localStorage.setItem('xxi_accent',accent)
 },[accent])

 async function load(){
  setLoading(true);setError('')
  const results=await Promise.all([
   supabase.from('products').select('*').eq('active',true).order('name'),
   supabase.from('warehouse_stock').select('*, products(*)').eq('location',location).order('qty',{ascending:true}),
   supabase.from('warehouse_stock').select('*, products(*)').order('qty',{ascending:true}),
   supabase.from('stock_transactions').select('*, products(name)').order('created_at',{ascending:false}).limit(500),
   supabase.from('racks').select('*').eq('active',true).order('rack_code'),
   supabase.from('rack_products').select('*, products(*)').order('sort_order'),
   supabase.from('pickup_requests').select('*, rack:racks(*), pickup_request_items(*, products(*))').order('created_at',{ascending:false}).limit(300),
   supabase.from('weekly_order_rows').select('*').order('row_no'),
   supabase.from('product_batches').select('*').order('created_at',{ascending:false})
  ])
  const bad=results.find(x=>x.error)?.error
  if(bad)setError(bad.message)
  setProducts((results[0].data||[]) as Product[]); setStocks((results[1].data||[]) as Stock[]); setAllStocks((results[2].data||[]) as Stock[]); setTx((results[3].data||[]) as Tx[])
  setRacks((results[4].data||[]) as Rack[]); setRackProducts((results[5].data||[]) as RackProduct[]); setPickups((results[6].data||[]) as Pickup[]); setOrders((results[7].data||[]) as OrderRow[])
  setBatches((results[8].data||[]) as Batch[])
  setLoading(false)
 }
 useEffect(()=>{load()},[location])
 useEffect(()=>{const params=new URLSearchParams(window.location.search);const rackId=params.get('rack');if(rackId&&racks.length){const r=racks.find(x=>x.id===rackId);if(r){setPickupRack(r);window.history.replaceState({},'',window.location.pathname)}}},[racks])

 const productMatchesCategory=(p:Product|undefined,cat:'Usage'|'Weekly'|'Produk Biasa')=>{const category=`${p?.category||''}`.toLowerCase();const tag=p?.barang_tag?.toLowerCase()||'';const usage=tag.includes('usage');const weekly=category.includes('weekly')||tag.includes('weekly');if(cat==='Usage')return usage;if(cat==='Weekly')return weekly;return !usage&&!weekly}
 const filtered=useMemo(()=>stocks.filter(s=>productMatchesCategory(s.products,inventoryCategory)&&`${s.products?.name||''} ${s.products?.product_code||''}`.toLowerCase().includes(q.toLowerCase())),[stocks,q,inventoryCategory])
 const historyUsage=useMemo(()=>tx.filter(x=>{const p=products.find(p=>p.id===x.product_id);const tag=p?.barang_tag?.toLowerCase()||'';return tag.includes('usage')}).filter(x=>`${x.products?.name||''} ${x.note||''}`.toLowerCase().includes(historyUsageQ.toLowerCase())),[tx,products,historyUsageQ])
 const historyWeekly=useMemo(()=>tx.filter(x=>{const p=products.find(p=>p.id===x.product_id);const tag=p?.barang_tag?.toLowerCase()||'';const cat=p?.category?.toLowerCase()||'';return !tag.includes('usage')}).filter(x=>`${x.products?.name||''} ${x.note||''}`.toLowerCase().includes(historyWeeklyQ.toLowerCase())),[tx,products,historyWeeklyQ])
 const pending=pickups.filter(x=>x.status==='PENDING')
 const low=allStocks.filter(s=>Number(s.qty)<=Number(s.products?.min_stock||0)).length
 const outOfStock=allStocks.filter(s=>Number(s.qty)<=0).length
 const outOfStockUtama=allStocks.filter(s=>s.location==='GUDANG_UTAMA'&&Number(s.qty)<=0).length
 const outOfStockTransit=allStocks.filter(s=>s.location==='GUDANG_TRANSIT'&&Number(s.qty)<=0).length
 const exp=products.filter(p=>p.exp_raw).length
 const today=new Date().toISOString().slice(0,10)
 const todayOut=tx.filter(x=>x.transaction_date===today&&['OUT','USAGE','SPOIL'].includes(x.type)).length
 const todayTransfer=allStocks.length?0:0
 const mainStock=allStocks.find(s=>s.product_id===transferProduct&&s.location==='GUDANG_UTAMA')
 const transitStock=allStocks.find(s=>s.product_id===transferProduct&&s.location==='GUDANG_TRANSIT')

 const [chartDateFrom,setChartDateFrom]=useState(()=>{const d=new Date();d.setDate(d.getDate()-30);return d.toISOString().slice(0,10)})
 const [chartDateTo,setChartDateTo]=useState(()=>new Date().toISOString().slice(0,10))

 const transitPickupByDate=useMemo(()=>{
  const map=new Map<string,number>()
  tx.filter(x=>x.location==='GUDANG_TRANSIT'&&['OUT','USAGE'].includes(x.type)&&x.transaction_date>=chartDateFrom&&x.transaction_date<=chartDateTo).forEach(x=>{
   map.set(x.transaction_date,(map.get(x.transaction_date)||0)+Number(x.qty||0))
  })
  return Array.from(map.entries()).sort(([a],[b])=>a.localeCompare(b)).map(([date,qty])=>({date,qty}))
 },[tx,chartDateFrom,chartDateTo])
 const transitPickupMax=Math.max(1,...transitPickupByDate.map(x=>x.qty))
 const expCount=products.filter(p=>p.exp_raw).length
 const noExpCount=products.length-expCount
 const donutCirc=2*Math.PI*42
 const expPct=products.length?Math.round(expCount/products.length*100):0
 const donutExpDash=donutCirc*(expPct/100)

 function guard(action:()=>void){if(admin){action();return}setPendingAction(()=>action);setLoginOpen(true)}
 function logout(){localStorage.removeItem('xxi_admin');setAdmin(false)}
 function login(){if(ADMINS.some(a=>a.id===loginId.trim()&&a.password===loginPass)){localStorage.setItem('xxi_admin','1');setAdmin(true);setLoginOpen(false);setLoginId('');setLoginPass('');const a=pendingAction;setPendingAction(null);a?.()}else alert('ID atau password admin salah.')}
 function openTx(s:Stock,type:'in'|'out'|'edit',txId?:string,dateValue?:string){guard(()=>{setSelected(s);setSelectedTxId(txId||'');setModal(type);setTxDate(dateValue||today);setQty(type==='edit'?String(s.qty):'');setUnit(s.products?.purchase_unit||'');setOutType('OUT');setNote('')})}
 function openEditStock(s:Stock){guard(()=>{setEditStockTarget(s);setEditStockQty(String(s.qty));setEditStockExp(s.products?.exp_raw||'');setEditStockOpen(true);setNewBatchCode('');setNewBatchExp('');setNewBatchQty('');setNewBatchNote('')})}
 async function saveEditStock(){
  if(!editStockTarget)return
  const newQty=Number(editStockQty)
  if(!Number.isFinite(newQty)||newQty<0){alert('Jumlah stok tidak valid');return}
  askConfirm(`Ubah stok ${editStockTarget.products?.name} di ${locLabel(editStockTarget.location)} menjadi ${fmt(newQty)}?`,async()=>{
   setEditStockSaving(true)
   const errors:string[]=[]
   const f=editStockTarget.products?.conversion_factor??1
   const newNorm=newQty*f
   const {error:stockErr}=await supabase
    .from('warehouse_stock')
    .update({qty:newQty,normalized_qty:newNorm,updated_at:new Date().toISOString()})
    .eq('product_id',editStockTarget.product_id)
    .eq('location',editStockTarget.location)
   if(stockErr)errors.push('Stok: '+stockErr.message)
   const newExp=editStockExp.trim()||null
   const {error:expErr}=await supabase
    .from('products')
    .update({exp_raw:newExp})
    .eq('id',editStockTarget.product_id)
   if(expErr)errors.push('EXP: '+expErr.message)
   setEditStockSaving(false)
   if(errors.length){alert(errors.join('\n'));return}
   setEditStockOpen(false)
   await load()
  })
 }
 async function saveBatch(){
  if(!editStockTarget)return
  if(!newBatchExp.trim()){alert('EXP date wajib diisi');return}
  setBatchSaving(true)
  const {error}=await supabase.from('product_batches').insert({
   product_id:editStockTarget.product_id,
   batch_code:newBatchCode.trim()||null,
   exp_date:newBatchExp.trim(),
   qty:newBatchQty?Number(newBatchQty):null,
   note:newBatchNote.trim()||null
  })
  setBatchSaving(false)
  if(error){alert(error.message);return}
  setNewBatchCode('');setNewBatchExp('');setNewBatchQty('');setNewBatchNote('')
  await load()
 }
 async function deleteBatch(b:Batch){
  askConfirm(`Hapus batch EXP "${b.exp_date}"${b.batch_code?` (${b.batch_code})`:''}?`,async()=>{
   const {error}=await supabase.from('product_batches').delete().eq('id',b.id)
   if(error){alert(error.message);return}
   await load()
  })
 }
 async function saveTx(){if(!selected)return;const n=Number(qty);if(!Number.isFinite(n)||n<=0){alert('Jumlah harus lebih dari 0');return}
  const label=modal==='in'?'Tambah Stok':modal==='out'?'Pengeluaran Stok':'Edit Transaksi'
  askConfirm(`${label} untuk ${selected.products?.name}?`,async()=>{
   setSaving(true);let error:any=null
   if(modal==='in')({error}=await supabase.rpc('stock_in',{p_product_id:selected.product_id,p_location:location,p_qty:n,p_unit:unit||selected.products?.purchase_unit,p_note:note||null}))
   else if(modal==='out')({error}=await supabase.rpc('stock_out',{p_product_id:selected.product_id,p_location:location,p_qty:n,p_unit:unit||selected.products?.purchase_unit,p_type:outType,p_note:note||null}))
   else ({error}=await supabase.rpc('edit_usage_transaction',{p_transaction_id:selectedTxId,p_new_qty:n,p_new_unit:unit||selected.products?.purchase_unit,p_new_note:note||null,p_new_date:txDate||today}))
   setSaving(false);if(error){alert(error.message);return}setModal(null);await load()
  })
 }
 async function transfer(){if(!transferProduct){alert('Pilih produk');return}const n=Number(transferQty);if(!Number.isFinite(n)||n<=0){alert('Jumlah harus lebih dari 0');return}
  const pName=products.find(p=>p.id===transferProduct)?.name||'produk ini'
  askConfirm(`Transfer ${fmt(n)} ${products.find(p=>p.id===transferProduct)?.purchase_unit||''} ${pName} ke Gudang Transit?`,async()=>{
   guard(async()=>{const {error}=await supabase.rpc('transfer_main_to_transit',{p_product_id:transferProduct,p_qty:n,p_note:transferNote||null});if(error)alert(error.message);else{setTransferQty('');setTransferNote('');await load()}})
  })
 }

 async function saveRack(){if(!rackCode.trim()||!rackName.trim()){alert('Kode dan nama rak wajib diisi.');return}if(rackSelected.length<3||rackSelected.length>50){alert('Satu rak harus berisi minimal 3 dan maksimal 50 produk.');return}
  askConfirm(`${rackEdit?'Simpan perubahan':'Buat'} rak ${rackName.trim()}?`,async()=>{
   guard(async()=>{let id=rackEdit?.id;let err:any;if(rackEdit){({error:err}=await supabase.from('racks').update({rack_code:rackCode.trim(),rack_name:rackName.trim(),description:rackDesc||null}).eq('id',rackEdit.id))}else{const r=await supabase.from('racks').insert({rack_code:rackCode.trim(),rack_name:rackName.trim(),description:rackDesc||null}).select().single();id=r.data?.id;err=r.error}if(err){alert(err.message);return}if(id){await supabase.from('rack_products').delete().eq('rack_id',id);const rows=rackSelected.map((p,i)=>({rack_id:id,product_id:p,sort_order:i}));const ins=await supabase.from('rack_products').insert(rows);if(ins.error){alert(ins.error.message);return}}setRackModal(false);await load()})
  })
 }
 function openRack(r?:Rack){setRackEdit(r||null);setRackCode(r?.rack_code||'');setRackName(r?.rack_name||'');setRackDesc(r?.description||'');setRackSelected(r?rackProducts.filter(x=>x.rack_id===r.id).sort((a,b)=>a.sort_order-b.sort_order).map(x=>x.product_id):[]);setRackModal(true)}
 async function deleteRack(r:Rack){guard(async()=>{askConfirm(`Hapus rak ${r.rack_name}? Tindakan ini tidak dapat dibatalkan.`,async()=>{const {error}=await supabase.from('racks').update({active:false}).eq('id',r.id);if(error)alert(error.message);else await load()})})}
 function qrUrl(r:Rack){return `${window.location.origin}${window.location.pathname}?rack=${r.id}`}
 function qrImg(r:Rack){return `https://quickchart.io/qr?text=${encodeURIComponent(qrUrl(r))}&size=400&margin=2`}
 async function saveQrPdf(r:Rack){
  try{
   // Fetch QR image via proxy canvas (crossOrigin) lalu download sebagai PNG
   const img=new Image()
   img.crossOrigin='anonymous'
   await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=reject;img.src=qrImg(r)+'&t='+Date.now()})
   const pad=32
   const c=document.createElement('canvas')
   // A4 portrait ratio tidak wajib — buat kotak proporsional dengan label
   c.width=img.width+pad*2
   c.height=img.height+pad*2+60
   const ctx=c.getContext('2d')!
   ctx.fillStyle='#ffffff'
   ctx.fillRect(0,0,c.width,c.height)
   // label atas
   ctx.fillStyle='#111312'
   ctx.font='bold 18px Inter,ui-sans-serif,system-ui,sans-serif'
   ctx.textAlign='center'
   ctx.fillText(`${r.rack_code} · ${r.rack_name}`,c.width/2,pad+14)
   // QR
   ctx.drawImage(img,pad,pad+24)
   // label bawah
   ctx.fillStyle='#747773'
   ctx.font='13px Inter,ui-sans-serif,system-ui,sans-serif'
   ctx.fillText('XXI Inventory · Grand Wisata',c.width/2,c.height-12)
   // download
   const a=document.createElement('a')
   a.download=`QR-${r.rack_code.replace(/[^a-zA-Z0-9]/g,'-')}.png`
   a.href=c.toDataURL('image/png')
   a.click()
  }catch{
   // fallback: buka gambar di tab baru, user bisa Save as PDF dari browser
   window.open(qrImg(r),'_blank')
  }
 }

 async function submitPickup(){if(!pickupRack)return;const sel=Object.entries(pickupItems).filter(([,v])=>Number(v)>0);if(!sel.length){alert('Pilih minimal satu produk.');return}if(!requester.trim()){alert('Nama pengambil wajib diisi.');return}for(const [pid,qty0] of sel){const stock=allStocks.find(s=>s.location==='GUDANG_TRANSIT'&&s.product_id===pid);if(!stock||Number(qty0)>Number(stock.qty)){alert(`Stok Transit tidak cukup untuk ${stock?.products?.name||pid}.`);return}}
  askConfirm(`Ajukan pengambilan dari rak ${pickupRack.rack_name} atas nama ${requester.trim()}?`,async()=>{
   const r=await supabase.from('pickup_requests').insert({rack_id:pickupRack.id,requester_name:requester.trim(),note:pickupNote||null,status:'PENDING'}).select().single();if(r.error){alert(r.error.message);return}const rows=sel.map(([product_id,qty0])=>({request_id:r.data.id,product_id,qty:Number(qty0),unit:allStocks.find(s=>s.product_id===product_id&&s.location==='GUDANG_TRANSIT')?.products?.purchase_unit||'PCS'}));const ins=await supabase.from('pickup_request_items').insert(rows);if(ins.error){alert(ins.error.message);return}setPickupRack(null);setPickupItems({});setRequester('');setPickupNote('');await load()
  })
 }
 async function approvePickup(p:Pickup){guard(async()=>{askConfirm(`Approve REQ-${String(p.request_no).padStart(5,'0')} dari ${p.requester_name||'pengguna'}? Stok Transit akan langsung dikurangi.`,async()=>{const {error}=await supabase.rpc('approve_pickup_request',{p_request_id:p.id});if(error)alert(error.message);else await load()})})}
 async function rejectPickup(p:Pickup){guard(async()=>{const reason=prompt('Alasan reject (opsional)')||null;askConfirm(`Reject REQ-${String(p.request_no).padStart(5,'0')}?`,async()=>{const {error}=await supabase.rpc('reject_pickup_request',{p_request_id:p.id,p_reason:reason});if(error)alert(error.message);else await load()})})}

 async function startScanner(){
  setScannerOpen(true);setScanValue('');setScanStatus('idle');setScanError('')
  try{
   const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:1280},height:{ideal:720}}})
   streamRef.current=stream
   if(videoRef.current){
    videoRef.current.srcObject=stream
    await videoRef.current.play()
   }
   setScanStatus('scanning')
   const jsQR=(await import('jsqr')).default
   const tick=()=>{
    const video=videoRef.current
    const canvas=canvasRef.current
    if(!streamRef.current||!video||video.paused||video.ended||!canvas)return
    if(video.readyState===video.HAVE_ENOUGH_DATA){
     canvas.width=video.videoWidth
     canvas.height=video.videoHeight
     const ctx=canvas.getContext('2d')
     if(ctx){
      ctx.drawImage(video,0,0,canvas.width,canvas.height)
      const imageData=ctx.getImageData(0,0,canvas.width,canvas.height)
      const code=jsQR(imageData.data,imageData.width,imageData.height,{inversionAttempts:'dontInvert'})
      if(code?.data){handleScan(code.data);return}
     }
    }
    rafRef.current=requestAnimationFrame(tick)
   }
   rafRef.current=requestAnimationFrame(tick)
  }catch(e:any){
   console.error('[Scanner] Gagal akses kamera:', e?.name, e?.message, e)
   const msg=e?.name==='NotAllowedError'?'Izin kamera ditolak. Klik ikon kunci/kamera di address bar browser lalu izinkan akses kamera, kemudian refresh halaman.'
    :e?.name==='NotFoundError'?'Kamera tidak ditemukan di perangkat ini.'
    :e?.name==='NotReadableError'?'Kamera sedang dipakai aplikasi lain. Tutup aplikasi lain yang menggunakan kamera.'
    :e?.name==='OverconstrainedError'?'Resolusi kamera tidak didukung, coba lagi.'
    :`Kamera tidak dapat diakses (${e?.name||'unknown'}). Gunakan input manual di bawah.`
   setScanError(msg)
   setScanStatus('error')
  }
 }
 function stopScanner(){
  if(rafRef.current)cancelAnimationFrame(rafRef.current)
  rafRef.current=null
  streamRef.current?.getTracks().forEach(t=>t.stop())
  streamRef.current=null
  setScannerOpen(false)
  setScanStatus('idle')
 }
 function handleScan(value:string){const m=value.match(/[?&]rack=([^&]+)/);const id=m?.[1]||value.trim();const r=racks.find(x=>x.id===id);if(r){stopScanner();setPickupRack(r)}else alert('QR Rak tidak dikenali.')}
 async function saveSettingsPhoto(file:File){const reader=new FileReader();reader.onload=()=>{const img=new Image();img.onload=()=>{const c=document.createElement('canvas');const max=1200;const scale=Math.min(1,max/Math.max(img.width,img.height));c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);c.getContext('2d')?.drawImage(img,0,0,c.width,c.height);const data=c.toDataURL('image/jpeg',.82);setDashboardPhoto(data);localStorage.setItem('xxi_dashboard_photo',data)};img.src=String(reader.result)};reader.readAsDataURL(file)}
 function go(t:Tab){setTab(t);window.scrollTo({top:0,behavior:'smooth'})}

 const rackView=(r:Rack)=>rackProducts.filter(x=>x.rack_id===r.id).sort((a,b)=>a.sort_order-b.sort_order)

 return <main className="appShell">
  <aside className="sidebar">
   <div className="sideBrand"><div className="logoMark">XXI</div><div><strong>XXI Inventory</strong><span>Grand Wisata</span></div></div>
   <div className="sideLabel">MENU</div>
   <nav className="sideNav">{nav.map(([k,l,d])=><button key={k} className={tab===k?'sideItem active':'sideItem'} onClick={()=>go(k)}><span>{l}</span><small>{d}</small>{k==='approval'&&pending.length>0&&<em>{pending.length}</em>}</button>)}</nav>
   <div className="sideFoot"><span className="statusDot"/> {admin?'Admin aktif':'Mode pengguna'}<div>Gudang Utama + Transit</div></div>
  </aside>
  <section className="content">
   <header className="topbar"><div><div className="eyebrow">XXI INVENTORY · GRAND WISATA</div><h1>{nav.find(x=>x[0]===tab)?.[1]}</h1><p>{nav.find(x=>x[0]===tab)?.[2]}</p></div><div className="topActions"><span className="dateNow">{new Intl.DateTimeFormat('id-ID',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(new Date())}</span><button className="iconBtn" title="Scan QR Rak" onClick={startScanner} aria-label="Buka scanner kamera"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></button><button className="iconBtn" title="Pengaturan" onClick={()=>setSettingsOpen(true)}>⚙</button></div></header>
   {error&&<div className="notice">Supabase: {error}</div>}

   {tab==='dashboard'&&<>
    <div className="hero"><div><div className="eyebrow">CONTROL CENTER</div><h2>Stok lebih rapi. Pergerakan lebih jelas.</h2><p>Kelola Gudang Utama dan Gudang Transit, pantau pengambilan, transfer, stok rendah, dan EXP dari satu tempat.</p></div><button className="heroButton" onClick={()=>go('inventory')}>Buka Inventory →</button></div>

    <div className="metricGrid dashboardMetrics">
      <div className="metric"><span>Total produk</span><strong>{fmt(products.length)}</strong><small>seluruh master produk aktif</small></div>
      <div className="metric"><span>EXP tercatat</span><strong>{fmt(exp)}</strong><small>produk dengan data EXP</small></div>
      <div className="metric"><span>Pengambilan hari ini</span><strong>{fmt(todayOut)}</strong><small>transaksi pengeluaran hari ini</small></div>
      <div className="metric"><span>Habis stok — Utama</span><strong style={{color:outOfStockUtama>0?'var(--danger)':'inherit'}}>{fmt(outOfStockUtama)}</strong><small>produk qty = 0 di Gudang Utama</small></div>
      <div className="metric"><span>Habis stok — Transit</span><strong style={{color:outOfStockTransit>0?'var(--danger)':'inherit'}}>{fmt(outOfStockTransit)}</strong><small>produk qty = 0 di Gudang Transit</small></div>
    </div>

    <div className="dashboardCharts">
      <div className="panel chartPanel">
        <div className="panelHead"><div><b>Pengambilan Barang Transit</b><span>Jumlah pengeluaran Gudang Transit berdasarkan tanggal.</span></div><div style={{display:'flex',alignItems:'center',gap:'6px',flexWrap:'wrap'}}><div style={{display:'flex',alignItems:'center',gap:'4px'}}><label style={{fontSize:'9px',color:'var(--muted)',whiteSpace:'nowrap'}}>Dari</label><input type="date" className="input" style={{padding:'4px 7px',fontSize:'9px',width:'120px',height:'28px'}} value={chartDateFrom} onChange={e=>setChartDateFrom(e.target.value)}/></div><div style={{display:'flex',alignItems:'center',gap:'4px'}}><label style={{fontSize:'9px',color:'var(--muted)',whiteSpace:'nowrap'}}>s/d</label><input type="date" className="input" style={{padding:'4px 7px',fontSize:'9px',width:'120px',height:'28px'}} value={chartDateTo} onChange={e=>setChartDateTo(e.target.value)}/></div><span className="chartMeta">{fmt(transitPickupByDate.reduce((n,x)=>n+x.qty,0))} item</span></div></div>
        {transitPickupByDate.length?
          <div className="barChart" aria-label="Grafik pengambilan barang transit per tanggal">
            <div className="barYAxis"><span>{fmt(transitPickupMax)}</span><span>{fmt(Math.round(transitPickupMax/2))}</span><span>0</span></div>
            <div className="barArea">
              <div className="barGridLine top"></div><div className="barGridLine mid"></div><div className="barGridLine bottom"></div>
              <div className="bars" style={{position:'relative'}}>
                {transitPickupByDate.map(x=>{
                  const h=Math.max(5,(x.qty/transitPickupMax)*100)
                  const [y,m,d]=x.date.split('-')
                  const label=`${d}/${m}/${y.slice(2)}`
                  return <div className="barItem" key={x.date} title={`${new Date(`${x.date}T00:00:00`).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'})}: ${fmt(x.qty)} item`}><div className="barValue">{fmt(x.qty)}</div><div className="bar" style={{height:`${h}%`}}></div><span>{label}</span></div>
                })}
              </div>
            </div>
          </div>
        :<div className="chartEmpty">Belum ada pengambilan Gudang Transit.</div>}
        {transitPickupByDate.length>0&&<div style={{display:'flex',justifyContent:'space-between',fontSize:'9px',color:'var(--muted)',marginTop:'6px',paddingLeft:'50px'}}><span>{(()=>{const [y,m,d]=transitPickupByDate[0].date.split('-');return `${d}/${m}/${y.slice(2)}`})()}</span><span>{(()=>{const [y,m,d]=transitPickupByDate[transitPickupByDate.length-1].date.split('-');return `${d}/${m}/${y.slice(2)}`})()}</span></div>}
      </div>

      <div className="panel chartPanel stockChartPanel">
        <div className="panelHead"><div><b>EXP Tercatat</b><span>Produk dengan & tanpa data kadaluarsa.</span></div></div>
        <div className="donutWrap">
          <div className="donut">
            <svg viewBox="0 0 100 100" role="img" aria-label="Distribusi produk dengan dan tanpa data EXP">
              <circle cx="50" cy="50" r="42" fill="none" stroke="var(--soft)" strokeWidth="11"/>
              <circle cx="50" cy="50" r="42" fill="none" stroke="var(--accent)" strokeWidth="11" strokeLinecap="round" strokeDasharray={`${donutExpDash} ${donutCirc-donutExpDash}`} transform="rotate(-90 50 50)"/>
            </svg>
            <div className="donutCenter"><strong>{fmt(expCount)}</strong><span>ada EXP</span></div>
          </div>
          <div className="donutLegend">
            <div><i className="legendDot main"></i><span>Ada EXP</span><b>{expPct}%</b></div>
            <div><i className="legendDot noexp"></i><span>Tidak Ada EXP</span><b>{products.length?100-expPct:0}%</b></div>
            <div style={{gridColumn:'1/-1',borderTop:'1px solid var(--soft)',paddingTop:'8px',fontSize:'9px',color:'var(--muted)'}}>{fmt(expCount)} dari {fmt(products.length)} produk</div>
          </div>
        </div>
      </div>

      <div className="panel approvalPanel">
        <div className="panelHead"><div><b>Approval Pengambilan</b><span>{pending.length} request menunggu.</span></div><button className="linkBtn" onClick={()=>go('approval')}>Buka →</button></div>
        {pending.slice(0,4).map(p=><div className="activity" key={p.id}><div><b>REQ-{String(p.request_no).padStart(5,'0')}</b><small>{p.requester_name||'Tanpa nama'} · {p.rack?.rack_name||'Rak'}</small></div><span className="badge warn">PENDING</span></div>)}
        {!pending.length&&<div className="empty">Tidak ada pending.</div>}
      </div>
    </div>

    <div className="dashboardBottom">
      <div className="panel activityPanel">
        <div className="panelHead"><div><b>Aktivitas terbaru</b><span>5 transaksi pengambilan/pengeluaran terakhir.</span></div><button className="linkBtn" onClick={()=>go('history')}>Lihat History →</button></div>
        {tx.slice(0,5).map(x=><div className="activity" key={x.id}><div><b>{x.products?.name||'Produk'}</b><small>{typeLabel(x.type)} · {locLabel(x.location)} · {new Date(`${x.transaction_date}T00:00:00`).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'})}</small></div><strong>−{fmt(x.qty)} {x.unit}</strong></div>)}
        {!tx.length&&<div className="empty">Belum ada aktivitas.</div>}
      </div>

      <div className="panel dashboardPhoto">
        <div className="panelHead"><div><b>Grand Wisata XXI</b><span>Foto lokasi</span></div></div>
        {dashboardPhoto?<img src={dashboardPhoto} alt="Grand Wisata XXI"/>:<div className="photoPlaceholder">Foto Grand Wisata dapat diganti admin melalui Pengaturan.</div>}
      </div>
    </div>
   </>}
   {tab==='transfer'&&<>
    <div className="summaryStrip"><b>Transfer Gudang Utama → Transit</b><span>Hanya tersedia untuk admin. Stok dipindahkan dari Gudang Utama ke Gudang Transit.</span></div>
    <div className="panel" style={{maxWidth:'520px'}}>
     <div className="panelHead"><div><b>Transfer Stok</b><span>Pilih produk dan jumlah yang akan dipindahkan.</span></div></div>
     <div className="form">
      <label>Produk
       <select className="input" value={transferProduct} onChange={e=>setTransferProduct(e.target.value)}>
        <option value="">Pilih produk…</option>
        {products.map(p=><option key={p.id} value={p.id}>{p.name} · {p.purchase_unit}</option>)}
       </select>
      </label>
      {transferProduct&&<div className="stockPreview">
       <div><span>Gudang Utama</span><b>{fmt(mainStock?.qty)} {mainStock?.products?.purchase_unit||''}</b></div>
       <div><span>Gudang Transit</span><b>{fmt(transitStock?.qty)} {transitStock?.products?.purchase_unit||''}</b></div>
      </div>}
      <label>Jumlah transfer
       <input className="input" type="number" min="0" step="any" value={transferQty} onChange={e=>setTransferQty(e.target.value)}/>
      </label>
      <label>Keterangan
       <textarea className="input" rows={2} value={transferNote} onChange={e=>setTransferNote(e.target.value)}/>
      </label>
      <button className="btn primary" onClick={transfer}>Transfer ke Transit</button>
     </div>
    </div>
   </>}

   {tab==='inventory'&&<><div className="pageTools"><div className="segmented"><button className={location==='GUDANG_UTAMA'?'selected':''} onClick={()=>setLocation('GUDANG_UTAMA')}>Gudang Utama</button><button className={location==='GUDANG_TRANSIT'?'selected':''} onClick={()=>setLocation('GUDANG_TRANSIT')}>Gudang Transit</button></div><input className="search" placeholder="Cari produk / kode…" value={q} onChange={e=>setQ(e.target.value)}/></div><div className="segmented inventoryCats"><button className={inventoryCategory==='Usage'?'selected':''} onClick={()=>setInventoryCategory('Usage')}>Usage</button><button className={inventoryCategory==='Weekly'?'selected':''} onClick={()=>setInventoryCategory('Weekly')}>Weekly</button><button className={inventoryCategory==='Produk Biasa'?'selected':''} onClick={()=>setInventoryCategory('Produk Biasa')}>Produk Biasa</button></div><div className="inventoryRule">{location==='GUDANG_UTAMA'?<><b>Gudang Utama:</b> Tambah, Kurangi, dan Transfer ke Gudang Transit.</>:<><b>Gudang Transit:</b> tidak ada Tambah manual. Admin tetap bisa melakukan pengeluaran manual tanpa scan.</>}</div><div className="panel tablePanel"><div className="tablewrap"><table className="table"><thead><tr><th>Produk</th><th>Kategori</th><th>Stok</th><th>EXP</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{filtered.map(s=><tr key={s.product_id}><td><b>{s.products?.name}</b><div className="small muted">{s.products?.product_code}</div></td><td>{s.products?.category||'Produk Biasa'}</td><td><strong>{fmt(s.qty)} {s.products?.purchase_unit}</strong><div className="small muted">base: {fmt(s.normalized_qty)} {s.products?.base_unit}</div></td><td>{(()=>{const pb=batches.filter(b=>b.product_id===s.product_id);const raw=s.products?.exp_raw;if(!pb.length&&!raw)return '—';return <div style={{display:'flex',flexDirection:'column',gap:'2px'}}>{raw&&<span style={{fontSize:'9px'}}>{raw}</span>}{pb.map(b=><span key={b.id} style={{fontSize:'8.5px',background:'var(--soft)',borderRadius:'4px',padding:'2px 5px',whiteSpace:'nowrap'}}>{b.batch_code?`[${b.batch_code}] `:''}{b.exp_date}{b.qty!=null?` · ${fmt(b.qty)}`:''}</span>)}</div>})()}</td><td><span className={'badge '+(Number(s.qty)<=Number(s.products?.min_stock||0)?'bad':'ok')}>{Number(s.qty)<=Number(s.products?.min_stock||0)?'Perlu perhatian':'Aman'}</span></td><td><div className="actions"><button className="btn" onClick={()=>openTx(s,'out')}>− Kurangi</button>{location==='GUDANG_UTAMA'&&<button className="btn primary" onClick={()=>openTx(s,'in')}>+ Tambah</button>}<button className="btn ghost" onClick={()=>openEditStock(s)}>✎ Edit</button></div></td></tr>)}</tbody></table>{!filtered.length&&<div className="empty">Produk tidak ditemukan.</div>}</div></div><div className="panel transferPanel"><div className="panelHead"><div><b>Transfer Gudang Utama → Transit</b><span>Hanya tersedia untuk admin.</span></div></div><div className="form transferForm"><label>Produk<select className="input" value={transferProduct} onChange={e=>setTransferProduct(e.target.value)}><option value="">Pilih produk…</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} · {p.purchase_unit}</option>)}</select></label>{transferProduct&&<div className="stockPreview"><div><span>Utama</span><b>{fmt(mainStock?.qty)} {mainStock?.products?.purchase_unit||''}</b></div><div><span>Transit</span><b>{fmt(transitStock?.qty)} {transitStock?.products?.purchase_unit||''}</b></div></div>}<label>Jumlah transfer<input className="input" type="number" min="0" step="any" value={transferQty} onChange={e=>setTransferQty(e.target.value)}/></label><label>Keterangan<textarea className="input" rows={2} value={transferNote} onChange={e=>setTransferNote(e.target.value)}/></label><button className="btn primary" onClick={transfer}>Transfer ke Transit</button></div></div></>}

   {tab==='history'&&<>
    <div className="pageTools" style={{marginBottom:'10px'}}>
     <div className="segmented"><button className={historyTab==='usage'?'selected':''} onClick={()=>setHistoryTab('usage')}>Usage <span style={{background:'var(--soft)',borderRadius:'10px',padding:'1px 6px',fontSize:'8px',marginLeft:'4px'}}>{historyUsage.length}</span></button><button className={historyTab==='weekly'?'selected':''} onClick={()=>setHistoryTab('weekly')}>Weekly & Lainnya <span style={{background:'var(--soft)',borderRadius:'10px',padding:'1px 6px',fontSize:'8px',marginLeft:'4px'}}>{historyWeekly.length}</span></button></div>
     <input className="search" placeholder="Cari produk…" value={historyTab==='usage'?historyUsageQ:historyWeeklyQ} onChange={e=>historyTab==='usage'?setHistoryUsageQ(e.target.value):setHistoryWeeklyQ(e.target.value)}/>
    </div>
    <div className="panel tablePanel">
     <div className="tablewrap"><table className="table historyTable"><thead><tr><th>Tanggal</th><th>Produk</th><th>Gudang</th><th>Jenis</th><th>Qty</th><th>Keterangan</th><th>Aksi</th></tr></thead><tbody>{(historyTab==='usage'?historyUsage:historyWeekly).map(x=><tr key={x.id}><td style={{whiteSpace:'nowrap'}}>{x.transaction_date}</td><td><b style={{fontSize:'10px'}}>{x.products?.name}</b></td><td style={{whiteSpace:'nowrap'}}>{locLabel(x.location)}</td><td style={{whiteSpace:'nowrap'}}><span className={`badge ${typeBadgeClass(x.type)}`}>{typeLabel(x.type)}</span></td><td style={{whiteSpace:'nowrap'}}>{fmt(x.qty)} {x.unit}</td><td className="wrap">{x.note||'—'}</td><td><button className="btn ghost" style={{whiteSpace:'nowrap'}} onClick={()=>{const s=allStocks.find(z=>z.product_id===x.product_id&&z.location===x.location);if(s)openTx({...s,qty:x.qty,location:x.location},'edit',x.id,x.transaction_date)}}>Edit</button></td></tr>)}</tbody></table>{!(historyTab==='usage'?historyUsage:historyWeekly).length&&<div className="empty">Belum ada history.</div>}</div>
    </div>
   </>}

   {tab==='approval'&&<><div className="summaryStrip"><b>{pending.length} pending</b><span>Pengambilan dari QR Rak baru mengurangi stok Gudang Transit setelah Admin approve.</span></div>{pickups.map(p=><div className="request"><div className="requesthead"><div><b>REQ-{String(p.request_no).padStart(5,'0')}</b><div className="muted">{p.requester_name||'Tanpa nama'} · {p.rack?.rack_name||'Rak'}</div></div><span className={'badge '+(p.status==='APPROVED'?'ok':p.status==='REJECTED'?'bad':'warn')}>{p.status}</span></div><div className="requestItems">{(p.pickup_request_items||[]).map(i=><div className="itemline" key={i.id}><span>{i.products?.name}</span><b>{fmt(i.qty)} {i.unit}</b><small>Sisa saat request: {fmt(allStocks.find(s=>s.product_id===i.product_id&&s.location==='GUDANG_TRANSIT')?.qty)}</small></div>)}</div><div className="small muted requestTime">{new Date(p.created_at).toLocaleString('id-ID')}</div>{p.status==='PENDING'&&<div className="actions requestActions"><button className="btn danger" onClick={()=>rejectPickup(p)}>Reject</button><button className="btn primary" onClick={()=>approvePickup(p)}>Approve & kurangi stok</button></div>}</div>)}{!pickups.length&&<div className="panel empty">Belum ada pengambilan.</div>}</>}

   {tab==='qr'&&<><div className="pageTools"><div><b>QR Rak</b><div className="small muted">1 rak minimal 3 produk, maksimal 50 produk.</div></div><button className="btn primary" onClick={()=>guard(()=>openRack())}>+ Buat Rak</button></div><div className="rackGrid">{racks.map(r=><div className="panel rackCard" key={r.id}><div className="rackQr"><img src={qrImg(r)} alt={`QR ${r.rack_name}`}/></div><div><div className="eyebrow">{r.rack_code}</div><h3>{r.rack_name}</h3><p>{r.description||'Rak pengambilan Gudang Transit'}</p><div className="small muted">{rackView(r).length} produk</div><div className="tagList">{rackView(r).slice(0,8).map(x=><span key={x.id}>{x.products.name}</span>)}{rackView(r).length>8&&<span>+{rackView(r).length-8} lainnya</span>}</div><div className="actions"><button className="btn" onClick={()=>setQrRack(r)}>Lihat QR</button><button className="btn primary" onClick={()=>saveQrPdf(r)}>⬇ Simpan PNG</button><button className="btn ghost" onClick={()=>guard(()=>openRack(r))}>Edit</button><button className="btn danger" onClick={()=>deleteRack(r)}>Hapus</button></div></div></div>)}{!racks.length&&<div className="panel empty">Belum ada rak.</div>}</div></>}

   {tab==='orders'&&<div className="panel tablePanel excelPanel"><div className="panelHead"><div><b>LIVING WORLD GRAND WISATA BEKASI XXI · PERIODE : JULI 2026</b><span>ORDERAN MINGGUAN · SISA OUTLET · format mengikuti Excel sumber.</span></div><input className="search compact" placeholder="Cari barang…" value={orderQ} onChange={e=>setOrderQ(e.target.value)}/></div><div className="tablewrap"><table className="excelTable"><thead><tr><th colSpan={6}>ORDERAN MINGGUAN · SISA OUTLET</th><th></th><th colSpan={4}>ORDERAN MINGGUAN</th></tr><tr><th>NO</th><th>NAMA BARANG</th><th>UOM</th><th>M1</th><th>M2</th><th>M3</th><th>M4</th><th>KETERANGAN</th><th>NO</th><th>NAMA BARANG</th><th>UOM</th><th>QTY</th><th>KETERANGAN</th></tr></thead><tbody>{orders.filter(o=>`${o.left_name||''} ${o.right_name||''}`.toLowerCase().includes(orderQ.toLowerCase())).map(o=><tr key={o.id}><td>{o.row_no}</td><td>{o.left_name||'—'}</td><td>{o.left_uom||'—'}</td><td>{o.m1??''}</td><td>{o.m2??''}</td><td>{o.m3??''}</td><td>{o.m4??''}</td><td>{o.left_note||''}</td><td>{o.right_no??''}</td><td>{o.right_name||''}</td><td>{o.right_uom||''}</td><td>{o.right_qty??''}</td><td>{o.right_note||''}</td></tr>)}</tbody></table></div></div>}

   {tab==='reports'&&<><div className="metricGrid"><div className="metric"><span>Total produk</span><strong>{fmt(products.length)}</strong><small>master aktif</small></div><div className="metric"><span>Low stock</span><strong>{fmt(low)}</strong><small>berdasarkan minimum</small></div><div className="metric"><span>Pengambilan hari ini</span><strong>{fmt(todayOut)}</strong><small>usage / pengeluaran</small></div><div className="metric"><span>Pending approval</span><strong>{fmt(pending.length)}</strong><small>request QR Rak</small></div></div><div className="twoCol"><div className="panel"><div className="panelHead"><div><b>Ringkasan gudang</b><span>Jumlah item aktif yang memiliki stok.</span></div></div><div className="warehouseRows"><div><span>Gudang Utama</span><b>{fmt(allStocks.filter(s=>s.location==='GUDANG_UTAMA'&&s.qty>0).length)} produk</b></div><div><span>Gudang Transit</span><b>{fmt(allStocks.filter(s=>s.location==='GUDANG_TRANSIT'&&s.qty>0).length)} produk</b></div></div></div><div className="panel"><div className="panelHead"><div><b>Catatan</b><span>Operasional</span></div></div><p className="reportText">Semua pengeluaran manual admin dan pengambilan QR yang sudah di-approve tercatat di History. Transfer hanya bergerak dari Gudang Utama ke Gudang Transit.</p></div></div></>}
  </section>

  {settingsOpen&&<div className="modalback"><div className="modal settings"><div className="requesthead"><div><div className="eyebrow">PENGATURAN</div><b>Konfigurasi website</b></div><button className="btn" onClick={()=>setSettingsOpen(false)}>Tutup</button></div><div className="settingBlock"><div><b>Login Admin</b><p className="muted">{admin?'Admin sedang aktif.':'Masuk sebagai admin untuk melakukan perubahan.'}</p></div>{admin?<button className="btn danger" onClick={logout}>Logout Admin</button>:<button className="btn primary" onClick={()=>{setSettingsOpen(false);setLoginOpen(true)}}>Login Admin</button>}</div><div className="settingBlock"><div><b>Foto Dashboard</b><p className="muted">Foto yang tampil di pojok kanan bawah Dashboard.</p></div>{admin?<input type="file" accept="image/*" onChange={e=>e.target.files?.[0]&&saveSettingsPhoto(e.target.files[0])}/>:<button className="btn" onClick={()=>{setSettingsOpen(false);setLoginOpen(true)}}>Login untuk ubah</button>}</div><div className="settingBlock"><div><b>Warna Website</b><p className="muted">Mengubah warna aksen seluruh website pada perangkat ini.</p></div><div className="colorRow">{['#1b1d1f','#0b6b57','#1d4ed8','#8a641b','#7c3aed','#b42318'].map(c=><button key={c} className="colorDot" style={{background:c}} onClick={()=>guard(()=>setAccent(c))} aria-label={c}/>)}</div></div></div></div>}
  {loginOpen&&<div className="modalback"><div className="modal login"><div className="eyebrow">ADMIN ACCESS</div><h2>Login Admin</h2><p className="muted">User hanya dapat melihat. Login diperlukan untuk perubahan.</p><label>ID<input className="input" value={loginId} onChange={e=>setLoginId(e.target.value)} autoFocus/></label><label>Password<div className="passwordWrap"><input className="input" type={showPass?'text':'password'} value={loginPass} onChange={e=>setLoginPass(e.target.value)} onKeyDown={e=>e.key==='Enter'&&login()}/><button type="button" className="showPass" onClick={()=>setShowPass(!showPass)}>{showPass?'Hide':'Show'}</button></div></label><div className="actions"><button className="btn" onClick={()=>{setLoginOpen(false);setPendingAction(null)}}>Batal</button><button className="btn primary" onClick={login}>Login</button></div></div></div>}
  {modal&&<div className="modalback"><div className="modal"><div className="requesthead"><div><div className="eyebrow">TRANSAKSI</div><b>{modal==='in'?'Tambah Stok':modal==='out'?'Pengeluaran Stok':'Edit History'}</b><div className="muted small">{selected?.products?.name} · {locLabel(selected?.location||location)}</div></div><button className="btn" onClick={()=>setModal(null)}>Tutup</button></div><div className="form"><label>Jumlah<input className="input" type="number" min="0" step="any" value={qty} onChange={e=>setQty(e.target.value)}/></label><label>Satuan<input className="input" value={unit} onChange={e=>setUnit(e.target.value)}/></label>{modal==='edit'&&<label>Tanggal<input className="input" type="date" value={txDate} onChange={e=>setTxDate(e.target.value)}/></label>}{modal==='out'&&<label>Jenis<select className="input" value={outType} onChange={e=>setOutType(e.target.value)}><option value="OUT">Pengeluaran</option><option value="USAGE">Usage</option><option value="SPOIL">Rusak / Spoil</option><option value="ADJUSTMENT">Adjustment</option></select></label>}<label>Keterangan<textarea className="input" rows={3} value={note} onChange={e=>setNote(e.target.value)}/></label><button className="btn primary saveBtn" disabled={saving} onClick={saveTx}>{saving?'Menyimpan…':'Simpan'}</button></div></div></div>}
  {rackModal&&<div className="modalback"><div className="modal wide"><div className="requesthead"><div><div className="eyebrow">QR RAK</div><b>{rackEdit?'Edit Rak':'Buat Rak'}</b><div className="muted small">Minimal 3, maksimal 50 produk.</div></div><button className="btn" onClick={()=>setRackModal(false)}>Tutup</button></div><div className="form"><label>Kode Rak<input className="input" value={rackCode} onChange={e=>setRackCode(e.target.value)} placeholder="A-01"/></label><label>Nama Rak<input className="input" value={rackName} onChange={e=>setRackName(e.target.value)} placeholder="Rak A-01"/></label><label>Keterangan<textarea className="input" rows={2} value={rackDesc} onChange={e=>setRackDesc(e.target.value)}/></label><div><b>Pilih produk ({rackSelected.length}/50)</b><div className="productPicker">{products.map(p=><label key={p.id} className="checkRow"><input type="checkbox" checked={rackSelected.includes(p.id)} onChange={e=>setRackSelected(v=>e.target.checked?(v.length<50?[...v,p.id]:v):v.filter(id=>id!==p.id))}/><span>{p.name}<small>{p.purchase_unit}</small></span></label>)}</div></div><button className="btn primary saveBtn" onClick={saveRack}>Simpan Rak</button></div></div></div>}
  {qrRack&&<div className="modalback"><div className="modal qrPreview"><div className="requesthead"><div><div className="eyebrow">QR RAK</div><b>{qrRack.rack_code} · {qrRack.rack_name}</b></div><button className="btn" onClick={()=>setQrRack(null)}>Tutup</button></div><img src={qrImg(qrRack)} alt="QR Rak"/><p className="small muted">Scan QR ini untuk membuka pengambilan produk dari Gudang Transit.</p><button className="btn primary" onClick={()=>saveQrPdf(qrRack)}>⬇ Simpan PNG</button></div></div>}
  {pickupRack&&<div className="modalback"><div className="modal wide"><div className="requesthead"><div><div className="eyebrow">PENGAMBILAN</div><b>{pickupRack.rack_code} · {pickupRack.rack_name}</b><div className="muted small">Sumber: Gudang Transit</div></div><button className="btn" onClick={()=>setPickupRack(null)}>Tutup</button></div><div className="pickupList">{rackView(pickupRack).map(rp=>{const s=allStocks.find(x=>x.product_id===rp.product_id&&x.location==='GUDANG_TRANSIT');return <div className="pickupRow" key={rp.id}><div><b>{rp.products.name}</b><small>Sisa stock: {fmt(s?.qty)} {rp.products.purchase_unit} · EXP: {rp.products.exp_raw||'—'}</small></div><input className="input qtyInput" type="number" min="0" max={s?.qty||0} step="any" value={pickupItems[rp.product_id]||''} onChange={e=>setPickupItems(v=>({...v,[rp.product_id]:Number(e.target.value)}))}/></div>})}</div><label>Nama pengambil<input className="input" value={requester} onChange={e=>setRequester(e.target.value)} placeholder="Nama user"/></label><label>Keterangan<textarea className="input" rows={2} value={pickupNote} onChange={e=>setPickupNote(e.target.value)}/></label><div className="pickupTotal">Total item dipilih: {fmt(Object.values(pickupItems).reduce<number>((a,b)=>a+Number(b||0),0))}</div><button className="btn primary saveBtn" onClick={submitPickup}>Ajukan Pengambilan</button></div></div>}
  {scannerOpen&&<div className="modalback"><div className="modal scanner"><div className="requesthead"><div><div className="eyebrow">KAMERA · QR RAK</div><b>Scan QR Rak</b></div><button className="btn" onClick={stopScanner}>Tutup</button></div>{scanStatus==='error'?<div className="notice" style={{marginBottom:'10px'}}>{scanError||'Kamera tidak dapat diakses.'}</div>:<><video ref={videoRef} className="scannerVideo" muted playsInline/><canvas ref={canvasRef} style={{display:'none'}} aria-hidden="true"/><p className="small muted">{scanStatus==='scanning'?'Arahkan kamera ke QR Code rak — scan otomatis saat terdeteksi.':'Memulai kamera…'}</p></>}<p className="small muted" style={{marginTop:'10px'}}>Atau masukkan link QR secara manual:</p><div className="actions"><input className="input" value={scanValue} onChange={e=>setScanValue(e.target.value)} placeholder="https://...?rack=..." onKeyDown={e=>e.key==='Enter'&&handleScan(scanValue)}/><button className="btn primary" onClick={()=>handleScan(scanValue)}>Buka</button></div></div></div>}
  {editStockOpen&&editStockTarget&&<div className="modalback"><div className="modal wide"><div className="requesthead"><div><div className="eyebrow">EDIT STOK & EXP</div><b>{editStockTarget.products?.name}</b><div className="muted small">{locLabel(editStockTarget.location)} · {editStockTarget.products?.product_code}</div></div><button className="btn" onClick={()=>setEditStockOpen(false)}>Tutup</button></div><div className="form"><label>Stok saat ini ({editStockTarget.products?.purchase_unit})<input className="input" type="number" min="0" step="any" value={editStockQty} onChange={e=>setEditStockQty(e.target.value)}/></label><div className="stockPreview"><div><span>Base unit ({editStockTarget.products?.base_unit})</span><b>{Number.isFinite(Number(editStockQty))?fmt(Number(editStockQty)*(editStockTarget.products?.conversion_factor??1)):'—'}</b></div><div><span>Min stok</span><b>{fmt(editStockTarget.products?.min_stock)}</b></div></div><label>EXP Utama (opsional)<input className="input" value={editStockExp} onChange={e=>setEditStockExp(e.target.value)} placeholder="cth: 31/12/2026 atau kosongkan jika tidak ada"/></label><div className="notice" style={{fontSize:'9px',padding:'8px 10px'}}>Perubahan stok ini langsung menimpa nilai saat ini dan tidak tercatat di history transaksi.</div><button className="btn primary saveBtn" disabled={editStockSaving} onClick={saveEditStock}>{editStockSaving?'Menyimpan…':'Simpan Perubahan'}</button></div>
   {/* Batch EXP Section */}
   <div style={{borderTop:'1px solid var(--soft)',marginTop:'16px',paddingTop:'14px'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}><b style={{fontSize:'11px'}}>Batch EXP</b><span className="small muted">Opsional — untuk produk dengan beberapa batch kadaluarsa</span></div>
    {(()=>{const pb=batches.filter(b=>b.product_id===editStockTarget.product_id);return pb.length?<div style={{display:'grid',gap:'6px',marginBottom:'12px'}}>{pb.map(b=><div key={b.id} style={{display:'grid',gridTemplateColumns:'1fr auto',gap:'8px',alignItems:'center',background:'var(--soft)',borderRadius:'7px',padding:'8px 10px'}}><div><span style={{fontSize:'10px',fontWeight:700}}>{b.exp_date}</span>{b.batch_code&&<span style={{fontSize:'9px',color:'var(--muted)',marginLeft:'6px'}}>[{b.batch_code}]</span>}{b.qty!=null&&<span style={{fontSize:'9px',color:'var(--muted)',marginLeft:'6px'}}>· {fmt(b.qty)} {editStockTarget.products?.purchase_unit}</span>}{b.note&&<div style={{fontSize:'9px',color:'var(--muted)',marginTop:'2px'}}>{b.note}</div>}</div><button className="btn danger" style={{padding:'4px 8px',fontSize:'9px'}} onClick={()=>deleteBatch(b)}>Hapus</button></div>)}</div>:<div className="empty" style={{padding:'12px',marginBottom:'8px'}}>Belum ada batch.</div>})()}
    <div style={{background:'var(--panel)',border:'1px solid var(--line)',borderRadius:'8px',padding:'12px',display:'grid',gap:'8px'}}>
     <div style={{fontSize:'10px',fontWeight:700,marginBottom:'2px'}}>+ Tambah Batch Baru</div>
     <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
      <label style={{fontSize:'9px',fontWeight:700,display:'grid',gap:'4px'}}>EXP Date <span style={{color:'var(--danger)'}}>*</span><input className="input" value={newBatchExp} onChange={e=>setNewBatchExp(e.target.value)} placeholder="cth: 31/12/2026"/></label>
      <label style={{fontSize:'9px',fontWeight:700,display:'grid',gap:'4px'}}>Kode Batch (opsional)<input className="input" value={newBatchCode} onChange={e=>setNewBatchCode(e.target.value)} placeholder="cth: LOT-2026-09"/></label>
      <label style={{fontSize:'9px',fontWeight:700,display:'grid',gap:'4px'}}>Qty batch (opsional)<input className="input" type="number" min="0" step="any" value={newBatchQty} onChange={e=>setNewBatchQty(e.target.value)} placeholder="—"/></label>
      <label style={{fontSize:'9px',fontWeight:700,display:'grid',gap:'4px'}}>Keterangan<input className="input" value={newBatchNote} onChange={e=>setNewBatchNote(e.target.value)} placeholder="—"/></label>
     </div>
     <button className="btn primary" style={{justifySelf:'start'}} disabled={batchSaving||!newBatchExp.trim()} onClick={saveBatch}>{batchSaving?'Menyimpan…':'Tambah Batch'}</button>
    </div>
   </div>
  </div></div>}
  {/* Confirm Dialog */}
  {confirmDialog&&<div className="modalback" style={{zIndex:60}}><div className="modal" style={{maxWidth:'380px',textAlign:'center',padding:'28px 24px'}}><div style={{fontSize:'22px',marginBottom:'10px'}}>⚠️</div><p style={{fontSize:'12px',fontWeight:700,margin:'0 0 6px'}}>{confirmDialog.msg}</p><p style={{fontSize:'10px',color:'var(--muted)',margin:'0 0 20px'}}>Tindakan ini akan langsung disimpan ke database.</p><div className="actions" style={{justifyContent:'center',gap:'10px'}}><button className="btn" style={{minWidth:'80px'}} onClick={()=>setConfirmDialog(null)}>Batal</button><button className="btn primary" style={{minWidth:'80px'}} onClick={runConfirm}>Ya, Lanjutkan</button></div></div></div>}

  {/* Success Skeleton Overlay */}
  {successAnim&&<div className="successOverlay" aria-live="polite"><div className="successCard"><div className="successCheck">✓</div><div className="skelLine"/><div className="skelLine short"/></div></div>}
 </main>
}
