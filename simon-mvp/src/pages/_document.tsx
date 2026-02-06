import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="es">
      <Head>
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        <meta name="theme-color" content="#0a0a0a" />
      </Head>
      <body className="bg-white text-neutral-900">
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
