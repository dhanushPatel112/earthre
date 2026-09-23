import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
    title: "EarthRe SLA Monitoring Dashboard",
    description: "Monitoring dashboard and ingestion pipeline."
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link
                    href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body>{children}</body>
        </html>
    )
}
