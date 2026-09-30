import './globals.css'
import type { Metadata } from 'next'
export const metadata: Metadata={title:'XXI Inventory — Grand Wisata',description:'Inventory Gudang Utama dan Gudang Transit'}
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="id"><body>{children}</body></html>}
