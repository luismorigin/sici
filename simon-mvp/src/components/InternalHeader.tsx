import Link from 'next/link'

interface InternalHeaderProps {
  backLink?: {
    href: string
    label: string
  }
}

export default function InternalHeader({ backLink }: InternalHeaderProps) {
  return (
    <header className="bg-white border-b border-gray-200 mb-6">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Logo - siempre lleva a landing */}
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 3L4 9v12h16V9l-8-6zm0 2.5l6 4.5v9H6v-9l6-4.5z"/>
            <path d="M10 14h4v6h-4z"/>
          </svg>
          <span className="font-bold text-lg text-gray-900">Simón</span>
        </Link>

        {/* Link de navegación opcional */}
        {backLink && (
          <Link
            href={backLink.href}
            className="text-blue-600 hover:underline text-sm"
          >
            {backLink.label}
          </Link>
        )}
      </div>
    </header>
  )
}
