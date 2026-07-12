"use client"

import Link from "next/link"
import { Music, Shield, ShoppingBag, Sparkles } from "lucide-react"

export default function Page() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Barra de Navegación Superior */}
      <header className="border-b border-border bg-card/50 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold">
            A
          </div>
          <span className="font-bold text-lg tracking-tight">Amplitude</span>
        </div>
        
        <div className="flex items-center gap-3">
          <Link 
            href="/dashboard" 
            className="text-xs font-medium px-4 py-2 rounded-lg hover:bg-accent transition-colors"
          >
            Iniciar Sesión
          </Link>
          <Link 
            href="/dashboard" 
            className="text-xs font-medium bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:opacity-90 transition-opacity shadow-md"
          >
            Registrarse
          </Link>
        </div>
      </header>

      {/* Sección Hero Principal */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary mb-6 border border-primary/20">
          <Sparkles className="size-3.5" /> El Hub definitivo para Músicos Independientes
        </div>
        
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4 bg-gradient-to-r from-foreground via-foreground to-muted-foreground bg-clip-text text-transparent">
          Controla tu música, tu merch y tus derechos.
        </h1>
        
        <p className="text-sm text-muted-foreground max-w-xl mb-8 leading-relaxed">
          Crea tu perfil profesional con IA, vende productos directamente a tus fans y protege tu propiedad intelectual con tecnología digital SHA-256. Todo en un solo lugar.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 mb-16">
          <Link 
            href="/dashboard" 
            className="text-sm font-semibold bg-primary text-primary-foreground px-6 py-3 rounded-xl hover:scale-105 transition-transform shadow-lg"
          >
            Comenzar como Artista
          </Link>
        </div>

        {/* Cuadrícula de Características (Los bloques que creamos) */}
        <div className="grid sm:grid-cols-3 gap-4 w-full max-w-2xl text-left">
          <div className="p-4 rounded-xl border border-border bg-card">
            <Music className="size-5 text-primary mb-2" />
            <h3 className="text-xs font-semibold mb-1">Catálogo e IA</h3>
            <p className="text-[11px] text-muted-foreground">Genera banners con IA y reproduce tus tracks nativamente.</p>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card">
            <ShoppingBag className="size-5 text-primary mb-2" />
            <h3 className="text-xs font-semibold mb-1">Tienda Integrada</h3>
            <p className="text-[11px] text-muted-foreground">Vende vinilos, ropa o servicios directamente sin intermediarios.</p>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card">
            <Shield className="size-5 text-primary mb-2" />
            <h3 className="text-xs font-semibold mb-1">Protección Legal</h3>
            <p className="text-[11px] text-muted-foreground">Registra autorías SHA-256 y emite licencias de uso firmadas.</p>
          </div>
        </div>
      </main>
    </div>
  )
}