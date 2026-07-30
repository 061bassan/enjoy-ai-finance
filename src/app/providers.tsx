import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PeriodProvider } from './period'
import { SessionProvider } from './session'
import { ThemeProvider } from './theme'

/**
 * `staleTime` alto de propósito: no provider local a leitura é instantânea e
 * os dados só mudam quando o próprio app escreve. Refetch ao focar a janela
 * seria puro desperdício. Quando o Supabase entrar, este é o lugar para
 * revisar a política de cache.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SessionProvider>
          <PeriodProvider>
            <TooltipProvider delayDuration={200}>
              <BrowserRouter>{children}</BrowserRouter>
              <Toaster
                position="bottom-right"
                toastOptions={{
                  classNames: {
                    toast:
                      'bg-popover border border-border text-popover-foreground text-sm rounded-lg',
                  },
                }}
              />
            </TooltipProvider>
          </PeriodProvider>
        </SessionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

export { queryClient }
