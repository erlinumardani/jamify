import type { ReactNode } from 'react'
import { AlertTriangle, ExternalLink } from 'lucide-react'
import { explainSmtpError } from '../lib/smtpErrors'

/** An SMTP failure explained as cause + fix, with the raw server response tucked away. */
export function SmtpErrorHelp({ raw, host, actions }: { raw: string; host?: string; actions?: ReactNode }) {
  const help = explainSmtpError(raw, host)
  return (
    <div role="alert" className="flex gap-3 rounded-sm border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-ck-red" aria-hidden="true" />
      <div className="min-w-0 space-y-1">
        <div className="font-medium">{help.title}</div>
        <div>{help.fix}</div>
        {(help.link || actions) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
            {help.link && (
              <a href={help.link.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-ck-blue-dark underline">
                {help.link.label} <ExternalLink size={12} aria-hidden="true" />
              </a>
            )}
            {actions}
          </div>
        )}
        <details className="pt-1 text-xs text-red-800">
          <summary className="cursor-pointer select-none">Server response</summary>
          <code className="mt-1 block break-all">{raw}</code>
        </details>
      </div>
    </div>
  )
}
