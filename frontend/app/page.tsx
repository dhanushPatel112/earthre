// "use client"

// import { useCallback, useEffect, useMemo, useState } from "react"
// import { Badge } from "@/components/ui/badge"
// import { Button } from "@/components/ui/button"
// import { Card, CardContent, CardHeader } from "@/components/ui/card"
// import { Input } from "@/components/ui/input"
// import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

// const API_URL = process.env.NEXT_PUBLIC_WORKER_API_URL ?? "http://localhost:8787"
// const DEFAULT_PAGE_SIZE = 25

// type OverallStats = {
//     availabilityPct: number | null
//     totalExpectedLogicalChecks: number
//     availableLogicalChecks: number
//     unavailableLogicalChecks: number
//     totalAgentObservations: number
//     dataQualityIssueCount: number
//     datasetStart: string | null
//     datasetEnd: string | null
// }
// type ServiceStat = {
//     service: string
//     availabilityPct: number
//     expectedChecks: number
//     availableChecks: number
//     unavailableChecks: number
//     averageLatency: number | null
//     p95Latency: number | null
// }
// type DashboardStats = { overall: OverallStats; perService: ServiceStat[] }
// type LogRow = {
//     timestamp: string
//     service: string
//     status: number
//     availability: "available" | "unavailable"
//     latency: number | null
//     agent: string
//     region: string
//     quality: string[]
// }
// type LogsResponse = { items: LogRow[]; page: number; pageSize: number; total: number }

// const toPercent = (value: number | null) => (value === null || Number.isNaN(value) ? "—" : `${value.toFixed(2)}%`)
// const formatDateTime = (value: string | null) =>
//     value
//         ? new Date(value).toLocaleString("en-GB", {
//               day: "2-digit",
//               month: "short",
//               year: "numeric",
//               hour: "2-digit",
//               minute: "2-digit",
//               timeZone: "UTC",
//           })
//         : "—"

// export default function HomePage() {
//     const [selectedFile, setSelectedFile] = useState<File | null>(null)
//     const [uploading, setUploading] = useState(false)
//     const [uploadSummary, setUploadSummary] = useState<Record<string, unknown> | null>(null)
//     const [errorMessage, setErrorMessage] = useState("")
//     const [stats, setStats] = useState<DashboardStats | null>(null)
//     const [logs, setLogs] = useState<LogsResponse>({ items: [], page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0 })
//     const [fromDate, setFromDate] = useState("2025-05-08")
//     const [toDate, setToDate] = useState("2025-05-16")
//     const [page, setPage] = useState(1)
//     const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
//     const [loadingLogs, setLoadingLogs] = useState(false)

//     const loadStats = useCallback(async () => {
//         const response = await fetch(`${API_URL}/dashboard/stats`)
//         if (!response.ok) throw new Error("Dashboard statistics could not be loaded.")
//         setStats(await response.json())
//     }, [])

//     const loadLogs = useCallback(async (signal?: AbortSignal) => {
//         setLoadingLogs(true)
//         try {
//             const query = new URLSearchParams({
//                 from: fromDate,
//                 to: toDate,
//                 page: String(page),
//                 limit: String(pageSize),
//             })
//             const response = await fetch(`${API_URL}/logs?${query}`, { signal })
//             if (!response.ok) throw new Error("Observation logs could not be loaded.")
//             setLogs(await response.json())
//         } finally {
//             setLoadingLogs(false)
//         }
//     }, [fromDate, toDate, page, pageSize])

//     useEffect(() => {
//         loadStats().catch((error) => setErrorMessage(error instanceof Error ? error.message : "Failed to load dashboard."))
//     }, [loadStats])

//     useEffect(() => {
//         const controller = new AbortController()
//         const timer = window.setTimeout(() => {
//             loadLogs(controller.signal).catch((error) => {
//                 if (error instanceof DOMException && error.name === "AbortError") return
//                 setErrorMessage(error instanceof Error ? error.message : "Failed to load logs.")
//             })
//         }, 350)
//         return () => {
//             window.clearTimeout(timer)
//             controller.abort()
//         }
//     }, [loadLogs])

//     const handleDateChange = (setter: (value: string) => void, value: string) => {
//         setter(value)
//         setPage(1)
//     }

//     const handlePageSizeChange = (value: string) => {
//         setPageSize(Number(value))
//         setPage(1)
//     }

//     const handleUpload = async () => {
//         if (!selectedFile) {
//             setErrorMessage("Select a CSV to upload.")
//             return
//         }
//         try {
//             setUploading(true)
//             setErrorMessage("")
//             const formData = new FormData()
//             formData.append("file", selectedFile)
//             const response = await fetch(`${API_URL}/uploads`, { method: "POST", body: formData })
//             const payload = await response.json()
//             if (!response.ok) throw new Error(payload.error ?? "Upload failed.")
//             setUploadSummary(payload)
//             await loadStats()
//             setPage(1)
//             await loadLogs()
//         } catch (error) {
//             setErrorMessage(error instanceof Error ? error.message : "Upload failed.")
//         } finally {
//             setUploading(false)
//         }
//     }

//     const totalPages = Math.max(1, Math.ceil(logs.total / pageSize))
//     const services = useMemo(() => stats?.perService ?? [], [stats])

//     return (
//         <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-50">
//             <div className="mx-auto max-w-7xl space-y-6">
//                 <Card className="border-cyan-500/20">
//                     <CardHeader>
//                         <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
//                             <div>
//                                 <p className="text-xs uppercase tracking-[0.22em] text-cyan-400">EarthRe</p>
//                                 <h1 className="mt-2 text-3xl font-bold">SLA monitoring dashboard</h1>
//                                 <p className="mt-2 text-sm text-slate-400">Upload a dataset, inspect logical SLA health, and investigate raw observations.</p>
//                             </div>
//                             <div className="flex flex-col gap-2 md:min-w-[420px]">
//                                 <label className="text-xs uppercase tracking-[0.2em] text-slate-400">CSV upload</label>
//                                 <div className="flex gap-2">
//                                     <Input type="file" accept=".csv" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} className="file:mr-3 file:rounded-md file:border-0 file:bg-cyan-500 file:px-3 file:py-1 file:text-sm file:font-medium file:text-slate-950" />
//                                     <Button type="button" onClick={handleUpload} disabled={uploading || !selectedFile}>{uploading ? "Uploading…" : "Upload"}</Button>
//                                 </div>
//                             </div>
//                         </div>
//                     </CardHeader>
//                 </Card>

//                 {errorMessage ? <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{errorMessage}</div> : null}

//                 {uploadSummary ? (
//                     <Card className="border-cyan-500/30 bg-cyan-500/5">
//                         <CardHeader><p className="text-lg font-semibold text-cyan-300">Upload completed</p></CardHeader>
//                         <CardContent className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
//                             <StatBox label="Source rows" value={String(uploadSummary.sourceRows ?? 0)} />
//                             <StatBox label="Retained" value={String(uploadSummary.retainedObservations ?? 0)} />
//                             <StatBox label="Duplicates" value={String(uploadSummary.duplicateRows ?? 0)} />
//                             <StatBox label="Quality issues" value={String(uploadSummary.qualityIssues ?? 0)} />
//                             <StatBox label="Services" value={String((uploadSummary.services as string[] | undefined)?.length ?? 0)} />
//                             <StatBox label="Dataset" value={`${formatDateTime(uploadSummary.datasetStart as string | null)} → ${formatDateTime(uploadSummary.datasetEnd as string | null)}`} />
//                         </CardContent>
//                     </Card>
//                 ) : null}

//                 <Card>
//                     <CardHeader><h2 className="text-xl font-semibold">Statistics</h2></CardHeader>
//                     <CardContent>
//                         {stats ? (
//                             <>
//                                 <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
//                                     <StatTile label="Overall availability" value={toPercent(stats.overall.availabilityPct)} />
//                                     <StatTile label="Expected checks" value={String(stats.overall.totalExpectedLogicalChecks)} />
//                                     <StatTile label="Available checks" value={String(stats.overall.availableLogicalChecks)} />
//                                     <StatTile label="Unavailable checks" value={String(stats.overall.unavailableLogicalChecks)} />
//                                     <StatTile label="Agent observations" value={String(stats.overall.totalAgentObservations)} />
//                                     <StatTile label="Quality issues" value={String(stats.overall.dataQualityIssueCount)} />
//                                     <StatTile label="Dataset start" value={formatDateTime(stats.overall.datasetStart)} />
//                                     <StatTile label="Dataset end" value={formatDateTime(stats.overall.datasetEnd)} />
//                                 </div>
//                                 <div className="mt-6 overflow-x-auto rounded-lg border border-slate-800">
//                                     <Table>
//                                         <TableHeader><TableRow><TableHead>Service</TableHead><TableHead>Availability</TableHead><TableHead>Expected</TableHead><TableHead>Available</TableHead><TableHead>Unavailable</TableHead><TableHead>Avg latency</TableHead><TableHead>P95 latency</TableHead></TableRow></TableHeader>
//                                         <TableBody>{services.map((service) => <TableRow key={service.service}><TableCell className="font-medium text-slate-100">{service.service}</TableCell><TableCell>{toPercent(service.availabilityPct)}</TableCell><TableCell>{service.expectedChecks}</TableCell><TableCell>{service.availableChecks}</TableCell><TableCell>{service.unavailableChecks}</TableCell><TableCell>{service.averageLatency !== null ? `${service.averageLatency.toFixed(0)} ms` : "—"}</TableCell><TableCell>{service.p95Latency !== null ? `${service.p95Latency.toFixed(0)} ms` : "—"}</TableCell></TableRow>)}</TableBody>
//                                     </Table>
//                                 </div>
//                             </>
//                         ) : <div className="rounded-lg border border-dashed border-slate-700 p-8 text-center text-slate-400">Waiting for dataset…</div>}
//                     </CardContent>
//                 </Card>

//                 <Card>
//                     <CardHeader>
//                         <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
//                             <div><h2 className="text-xl font-semibold">Observation logs</h2><p className="mt-1 text-sm text-slate-400">{logs.total.toLocaleString()} matching observations</p></div>
//                             <div className="flex flex-wrap gap-3">
//                                 <label className="text-xs uppercase tracking-[0.2em] text-slate-400">From<Input type="date" value={fromDate} onChange={(event) => handleDateChange(setFromDate, event.target.value)} className="mt-1 w-auto" /></label>
//                                 <label className="text-xs uppercase tracking-[0.2em] text-slate-400">To<Input type="date" value={toDate} onChange={(event) => handleDateChange(setToDate, event.target.value)} className="mt-1 w-auto" /></label>
//                                 <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Rows per page<select value={pageSize} onChange={(event) => handlePageSizeChange(event.target.value)} className="mt-1 h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm normal-case tracking-normal text-slate-100"><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label>
//                             </div>
//                         </div>
//                     </CardHeader>
//                     <CardContent>
//                         <div className="overflow-x-auto rounded-lg border border-slate-800">
//                             <Table>
//                                 <TableHeader><TableRow><TableHead>Timestamp</TableHead><TableHead>Service</TableHead><TableHead>Status</TableHead><TableHead>Availability</TableHead><TableHead>Latency</TableHead><TableHead>Agent</TableHead><TableHead>Region</TableHead><TableHead>Quality</TableHead></TableRow></TableHeader>
//                                 <TableBody>
//                                     {loadingLogs ? <TableRow><TableCell colSpan={8} className="py-10 text-center text-slate-400">Loading observations…</TableCell></TableRow> : logs.items.length ? logs.items.map((log, index) => <TableRow key={`${log.timestamp}-${log.service}-${log.agent}-${index}`}><TableCell>{formatDateTime(log.timestamp)}</TableCell><TableCell>{log.service}</TableCell><TableCell>{log.status}</TableCell><TableCell><Badge className={log.availability === "available" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-rose-500/40 bg-rose-500/10 text-rose-300"}>{log.availability}</Badge></TableCell><TableCell>{log.latency !== null ? `${log.latency.toFixed(0)} ms` : "—"}</TableCell><TableCell>{log.agent}</TableCell><TableCell>{log.region}</TableCell><TableCell>{log.quality.length ? <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-300">{log.quality.join(", ")}</Badge> : <span className="text-slate-500">OK</span>}</TableCell></TableRow>) : <TableRow><TableCell colSpan={8} className="py-10 text-center text-slate-400">No rows match the selected date filter.</TableCell></TableRow>}
//                                 </TableBody>
//                             </Table>
//                         </div>
//                         <div className="mt-4 flex flex-col gap-3 border-t border-slate-800 pt-4 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
//                             <span>Page {page} of {totalPages}</span>
//                             <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1 || loadingLogs} onClick={() => setPage((current) => current - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page >= totalPages || loadingLogs} onClick={() => setPage((current) => current + 1)}>Next</Button></div>
//                         </div>
//                     </CardContent>
//                 </Card>
//             </div>
//         </main>
//     )
// }

// function StatTile({ label, value }: { label: string; value: string }) {
//     return <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3"><p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p><p className="mt-2 text-xl font-semibold text-slate-50">{value}</p></div>
// }

// function StatBox({ label, value }: { label: string; value: string }) {
//     return <div className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2"><p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{label}</p><p className="mt-1 text-sm font-medium text-slate-100">{value}</p></div>
// }

"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useCallback, useEffect, useMemo, useState } from "react"

const API_URL = process.env.NEXT_PUBLIC_WORKER_API_URL ?? "http://localhost:8787"
const DEFAULT_PAGE_SIZE = 25

// Typography note: this design pairs a grotesk (headings/labels) with a mono
// face (all numbers, timestamps, status codes). Add these once in your root
// layout's <head> (or via next/font) and the fallback stacks below still
// degrade gracefully without them:
//
// <link rel="preconnect" href="https://fonts.googleapis.com" />
// <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />

const FONT_SANS = "'Space Grotesk', 'Inter', ui-sans-serif, system-ui, sans-serif"
const FONT_MONO = "'IBM Plex Mono', 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace"

type OverallStats = {
    availabilityPct: number | null
    totalExpectedLogicalChecks: number
    availableLogicalChecks: number
    unavailableLogicalChecks: number
    totalAgentObservations: number
    dataQualityIssueCount: number
    datasetStart: string | null
    datasetEnd: string | null
}
type ServiceStat = {
    service: string
    availabilityPct: number
    expectedChecks: number
    availableChecks: number
    unavailableChecks: number
    averageLatency: number | null
    p95Latency: number | null
}
type DashboardStats = { overall: OverallStats; perService: ServiceStat[] }
type LogRow = {
    timestamp: string
    service: string
    status: number
    availability: "available" | "unavailable"
    latency: number | null
    agent: string
    region: string
    quality: string[]
}
type LogsResponse = { items: LogRow[]; page: number; pageSize: number; total: number }

const toPercent = (value: number | null) => (value === null || Number.isNaN(value) ? "—" : `${value.toFixed(2)}%`)
const formatDateTime = (value: string | null) =>
    value
        ? new Date(value).toLocaleString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "UTC"
          })
        : "—"

export default function HomePage() {
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [uploading, setUploading] = useState(false)
    const [uploadSummary, setUploadSummary] = useState<Record<string, unknown> | null>(null)
    const [errorMessage, setErrorMessage] = useState("")
    const [stats, setStats] = useState<DashboardStats | null>(null)
    const [logs, setLogs] = useState<LogsResponse>({ items: [], page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0 })
    const [fromDate, setFromDate] = useState("2025-05-08")
    const [toDate, setToDate] = useState("2025-05-16")
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
    const [loadingLogs, setLoadingLogs] = useState(false)

    const loadStats = useCallback(async () => {
        const response = await fetch(`${API_URL}/dashboard/stats`)
        if (!response.ok) throw new Error("Dashboard statistics could not be loaded.")
        setStats(await response.json())
    }, [])

    const loadLogs = useCallback(
        async (signal?: AbortSignal) => {
            setLoadingLogs(true)
            try {
                const query = new URLSearchParams({
                    from: fromDate,
                    to: toDate,
                    page: String(page),
                    limit: String(pageSize)
                })
                const response = await fetch(`${API_URL}/logs?${query}`, { signal })
                if (!response.ok) throw new Error("Observation logs could not be loaded.")
                setLogs(await response.json())
            } finally {
                setLoadingLogs(false)
            }
        },
        [fromDate, toDate, page, pageSize]
    )

    useEffect(() => {
        loadStats().catch((error) =>
            setErrorMessage(error instanceof Error ? error.message : "Failed to load dashboard.")
        )
    }, [loadStats])

    useEffect(() => {
        const controller = new AbortController()
        const timer = window.setTimeout(() => {
            loadLogs(controller.signal).catch((error) => {
                if (error instanceof DOMException && error.name === "AbortError") return
                setErrorMessage(error instanceof Error ? error.message : "Failed to load logs.")
            })
        }, 350)
        return () => {
            window.clearTimeout(timer)
            controller.abort()
        }
    }, [loadLogs])

    const handleDateChange = (setter: (value: string) => void, value: string) => {
        setter(value)
        setPage(1)
    }

    const handlePageSizeChange = (value: string) => {
        setPageSize(Number(value))
        setPage(1)
    }

    const handleUpload = async () => {
        if (!selectedFile) {
            setErrorMessage("Select a CSV to upload.")
            return
        }
        try {
            setUploading(true)
            setErrorMessage("")
            const formData = new FormData()
            formData.append("file", selectedFile)
            const response = await fetch(`${API_URL}/uploads`, { method: "POST", body: formData })
            const payload = await response.json()
            if (!response.ok) throw new Error(payload.error ?? "Upload failed.")
            setUploadSummary(payload)
            await loadStats()
            setPage(1)
            await loadLogs()
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Upload failed.")
        } finally {
            setUploading(false)
        }
    }

    const totalPages = Math.max(1, Math.ceil(logs.total / pageSize))
    const services = useMemo(() => stats?.perService ?? [], [stats])

    return (
        <main
            className="min-h-screen px-4 py-10 sm:px-6 lg:px-10"
            style={{ background: "#090C10", color: "#E7EAEE", fontFamily: FONT_SANS }}
        >
            <div className="mx-auto max-w-7xl">
                {/* ── Instrument header ───────────────────────────────── */}
                <header
                    className="flex flex-col gap-6 border-b pb-6 lg:flex-row lg:items-end lg:justify-between"
                    style={{ borderColor: "#1C2430" }}
                >
                    <div>
                        <div className="flex items-center gap-2" style={{ color: "#D4A64A" }}>
                            <span
                                aria-hidden
                                className="inline-block h-1.5 w-1.5 rounded-full"
                                style={{ background: "#D4A64A" }}
                            />
                            <span className="text-[13px] font-medium" style={{ fontFamily: FONT_MONO }}>
                                EarthRe
                            </span>
                        </div>
                        <h1 className="mt-2 text-[2rem] font-semibold leading-tight sm:text-[2.4rem]">
                            SLA signal monitor
                        </h1>
                        <p className="mt-2 max-w-md text-sm" style={{ color: "#6B7684" }}>
                            Upload observation data, read logical SLA health, and step through the raw log.
                        </p>
                    </div>

                    <div
                        className="flex w-full flex-col gap-3 border p-4 sm:flex-row sm:items-center lg:w-auto"
                        style={{ borderColor: "#1C2430", background: "#10141B" }}
                    >
                        <div className="flex-1">
                            <label className="text-xs" style={{ color: "#6B7684" }}>
                                Dataset file (.csv)
                            </label>
                            <Input
                                type="file"
                                accept=".csv"
                                onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                                className="mt-1 h-9 border-0 bg-transparent p-0 text-sm file:mr-3 file:border-0 file:px-3 file:py-1.5 file:text-xs file:font-medium"
                                style={{ color: "#E7EAEE" }}
                            />
                        </div>
                        <Button
                            type="button"
                            onClick={handleUpload}
                            disabled={uploading || !selectedFile}
                            className="h-9 rounded-none px-5 text-sm font-medium"
                            style={{ background: "#D4A64A", color: "#090C10" }}
                        >
                            {uploading ? "Uploading…" : "Upload"}
                        </Button>
                    </div>
                </header>

                {errorMessage ? (
                    <div
                        className="mt-6 border px-4 py-3 text-sm"
                        style={{ borderColor: "#F0625B55", background: "#F0625B14", color: "#F5A9A5" }}
                    >
                        {errorMessage}
                    </div>
                ) : null}

                {uploadSummary ? (
                    <div className="mt-6 border" style={{ borderColor: "#1C2430" }}>
                        <p
                            className="border-b px-4 py-2.5 text-sm font-medium"
                            style={{ borderColor: "#1C2430", color: "#D4A64A" }}
                        >
                            Upload complete
                        </p>
                        <div
                            className="grid grid-cols-2 gap-px sm:grid-cols-3 lg:grid-cols-6"
                            style={{ background: "#1C2430" }}
                        >
                            <UploadStat label="Source rows" value={String(uploadSummary.sourceRows ?? 0)} />
                            <UploadStat label="Retained" value={String(uploadSummary.retainedObservations ?? 0)} />
                            <UploadStat label="Duplicates" value={String(uploadSummary.duplicateRows ?? 0)} />
                            <UploadStat label="Quality issues" value={String(uploadSummary.qualityIssues ?? 0)} />
                            <UploadStat
                                label="Services"
                                value={String((uploadSummary.services as string[] | undefined)?.length ?? 0)}
                            />
                            <UploadStat
                                label="Dataset span"
                                value={`${formatDateTime(uploadSummary.datasetStart as string | null)} → ${formatDateTime(uploadSummary.datasetEnd as string | null)}`}
                            />
                        </div>
                    </div>
                ) : null}

                {/* ── Statistics ──────────────────────────────────────── */}
                <section className="mt-10">
                    {stats ? (
                        <>
                            <div
                                className="grid grid-cols-1 border sm:grid-cols-[auto_1fr]"
                                style={{ borderColor: "#1C2430" }}
                            >
                                {/* Hero readout */}
                                <div
                                    className="flex flex-col justify-center border-b px-6 py-8 sm:border-b-0 sm:border-r sm:px-10"
                                    style={{ borderColor: "#1C2430" }}
                                >
                                    <span className="text-xs" style={{ color: "#6B7684" }}>
                                        Overall availability
                                    </span>
                                    <span
                                        className="mt-1 text-[3.75rem] font-semibold leading-none tabular-nums"
                                        style={{ fontFamily: FONT_MONO, color: "#4FD1A5" }}
                                    >
                                        {toPercent(stats.overall.availabilityPct)}
                                    </span>
                                    <span className="mt-3 text-xs" style={{ color: "#6B7684" }}>
                                        {formatDateTime(stats.overall.datasetStart)} →{" "}
                                        {formatDateTime(stats.overall.datasetEnd)}
                                    </span>
                                </div>

                                {/* Supporting readouts */}
                                <div
                                    className="grid grid-cols-2 gap-px sm:grid-cols-3"
                                    style={{ background: "#1C2430" }}
                                >
                                    <MetricCell
                                        label="Expected checks"
                                        value={stats.overall.totalExpectedLogicalChecks}
                                    />
                                    <MetricCell
                                        label="Available"
                                        value={stats.overall.availableLogicalChecks}
                                        tint="#4FD1A5"
                                    />
                                    <MetricCell
                                        label="Unavailable"
                                        value={stats.overall.unavailableLogicalChecks}
                                        tint="#F0625B"
                                    />
                                    <MetricCell
                                        label="Agent observations"
                                        value={stats.overall.totalAgentObservations}
                                    />
                                    <MetricCell
                                        label="Quality issues"
                                        value={stats.overall.dataQualityIssueCount}
                                        tint="#D4A64A"
                                    />
                                    <MetricCell label="Services tracked" value={services.length} />
                                </div>
                            </div>

                            {/* Per-service table */}
                            <div className="mt-6 overflow-x-auto border" style={{ borderColor: "#1C2430" }}>
                                <table className="w-full min-w-[720px] border-collapse text-sm">
                                    <thead>
                                        <tr className="border-b text-left" style={{ borderColor: "#1C2430" }}>
                                            {[
                                                "Service",
                                                "Availability",
                                                "Expected",
                                                "Available",
                                                "Unavailable",
                                                "Avg latency",
                                                "P95 latency"
                                            ].map((h) => (
                                                <th
                                                    key={h}
                                                    className="px-4 py-3 font-medium"
                                                    style={{ color: "#6B7684" }}
                                                >
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody style={{ fontFamily: FONT_MONO }}>
                                        {services.map((service) => (
                                            <tr
                                                key={service.service}
                                                className="border-b last:border-b-0"
                                                style={{ borderColor: "#1C2430" }}
                                            >
                                                <td className="px-4 py-3 font-medium" style={{ fontFamily: FONT_SANS }}>
                                                    {service.service}
                                                </td>
                                                <td className="px-4 py-3 tabular-nums" style={{ color: "#4FD1A5" }}>
                                                    {toPercent(service.availabilityPct)}
                                                </td>
                                                <td className="px-4 py-3 tabular-nums">{service.expectedChecks}</td>
                                                <td className="px-4 py-3 tabular-nums">{service.availableChecks}</td>
                                                <td className="px-4 py-3 tabular-nums">{service.unavailableChecks}</td>
                                                <td className="px-4 py-3 tabular-nums" style={{ color: "#6B7684" }}>
                                                    {service.averageLatency !== null
                                                        ? `${service.averageLatency.toFixed(0)} ms`
                                                        : "—"}
                                                </td>
                                                <td className="px-4 py-3 tabular-nums" style={{ color: "#6B7684" }}>
                                                    {service.p95Latency !== null
                                                        ? `${service.p95Latency.toFixed(0)} ms`
                                                        : "—"}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    ) : (
                        <div
                            className="border border-dashed p-10 text-center text-sm"
                            style={{ borderColor: "#1C2430", color: "#6B7684" }}
                        >
                            Waiting for dataset upload.
                        </div>
                    )}
                </section>

                {/* ── Observation logs ────────────────────────────────── */}
                <section className="mt-10">
                    <div
                        className="flex flex-col gap-4 border-b pb-4 lg:flex-row lg:items-end lg:justify-between"
                        style={{ borderColor: "#1C2430" }}
                    >
                        <div>
                            <h2 className="text-lg font-semibold">Observation log</h2>
                            <p className="mt-1 text-sm" style={{ color: "#6B7684", fontFamily: FONT_MONO }}>
                                {logs.total.toLocaleString()} matching rows
                            </p>
                        </div>
                        <div className="flex flex-wrap items-end gap-4">
                            <Field label="From">
                                <Input
                                    type="date"
                                    value={fromDate}
                                    onChange={(event) => handleDateChange(setFromDate, event.target.value)}
                                    className="h-9 w-auto rounded-none border-0 border-b text-sm"
                                    style={{
                                        borderColor: "#1C2430",
                                        background: "transparent",
                                        color: "#E7EAEE",
                                        fontFamily: FONT_MONO
                                    }}
                                />
                            </Field>
                            <Field label="To">
                                <Input
                                    type="date"
                                    value={toDate}
                                    onChange={(event) => handleDateChange(setToDate, event.target.value)}
                                    className="h-9 w-auto rounded-none border-0 border-b text-sm"
                                    style={{
                                        borderColor: "#1C2430",
                                        background: "transparent",
                                        color: "#E7EAEE",
                                        fontFamily: FONT_MONO
                                    }}
                                />
                            </Field>
                            <Field label="Rows per page">
                                <select
                                    value={pageSize}
                                    onChange={(event) => handlePageSizeChange(event.target.value)}
                                    className="h-9 border-0 border-b bg-transparent px-1 text-sm focus:outline-none"
                                    style={{ borderColor: "#1C2430", color: "#E7EAEE", fontFamily: FONT_MONO }}
                                >
                                    <option value={10}>10</option>
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                </select>
                            </Field>
                        </div>
                    </div>

                    <div className="mt-4 overflow-x-auto border" style={{ borderColor: "#1C2430" }}>
                        <table className="w-full min-w-[900px] border-collapse text-sm">
                            <thead>
                                <tr className="border-b text-left" style={{ borderColor: "#1C2430" }}>
                                    {[
                                        "Timestamp",
                                        "Service",
                                        "Status",
                                        "Availability",
                                        "Latency",
                                        "Agent",
                                        "Region",
                                        "Quality"
                                    ].map((h) => (
                                        <th key={h} className="px-4 py-3 font-medium" style={{ color: "#6B7684" }}>
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody style={{ fontFamily: FONT_MONO }}>
                                {loadingLogs ? (
                                    <tr>
                                        <td
                                            colSpan={8}
                                            className="py-10 text-center"
                                            style={{ color: "#6B7684", fontFamily: FONT_SANS }}
                                        >
                                            Loading observations…
                                        </td>
                                    </tr>
                                ) : logs.items.length ? (
                                    logs.items.map((log, index) => (
                                        <tr
                                            key={`${log.timestamp}-${log.service}-${log.agent}-${index}`}
                                            className="border-b last:border-b-0"
                                            style={{ borderColor: "#1C2430" }}
                                        >
                                            <td className="px-4 py-3 tabular-nums" style={{ color: "#6B7684" }}>
                                                {formatDateTime(log.timestamp)}
                                            </td>
                                            <td className="px-4 py-3" style={{ fontFamily: FONT_SANS }}>
                                                {log.service}
                                            </td>
                                            <td className="px-4 py-3 tabular-nums">{log.status}</td>
                                            <td className="px-4 py-3">
                                                <span className="inline-flex items-center gap-2">
                                                    <span
                                                        aria-hidden
                                                        className="inline-block h-1.5 w-1.5 rounded-full"
                                                        style={{
                                                            background:
                                                                log.availability === "available" ? "#4FD1A5" : "#F0625B"
                                                        }}
                                                    />
                                                    <span
                                                        style={{
                                                            color:
                                                                log.availability === "available" ? "#4FD1A5" : "#F0625B"
                                                        }}
                                                    >
                                                        {log.availability}
                                                    </span>
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 tabular-nums">
                                                {log.latency !== null ? `${log.latency.toFixed(0)} ms` : "—"}
                                            </td>
                                            <td className="px-4 py-3" style={{ color: "#6B7684" }}>
                                                {log.agent}
                                            </td>
                                            <td className="px-4 py-3" style={{ color: "#6B7684" }}>
                                                {log.region}
                                            </td>
                                            <td className="px-4 py-3">
                                                {log.quality.length ? (
                                                    <span style={{ color: "#D4A64A" }}>{log.quality.join(", ")}</span>
                                                ) : (
                                                    <span style={{ color: "#3A4350" }}>ok</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td
                                            colSpan={8}
                                            className="py-10 text-center"
                                            style={{ color: "#6B7684", fontFamily: FONT_SANS }}
                                        >
                                            No rows match the selected date filter.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div
                        className="mt-3 flex flex-col gap-3 border-t pt-4 text-sm sm:flex-row sm:items-center sm:justify-between"
                        style={{ borderColor: "#1C2430", color: "#6B7684" }}
                    >
                        <span style={{ fontFamily: FONT_MONO }}>
                            Page {page} of {totalPages}
                        </span>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page <= 1 || loadingLogs}
                                onClick={() => setPage((current) => current - 1)}
                                className="rounded-none border-[#1C2430] bg-transparent text-sm hover:bg-[#10141B] hover:text-[#E7EAEE]"
                                style={{ color: "#E7EAEE" }}
                            >
                                Previous
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page >= totalPages || loadingLogs}
                                onClick={() => setPage((current) => current + 1)}
                                className="rounded-none border-[#1C2430] bg-transparent text-sm hover:bg-[#10141B] hover:text-[#E7EAEE]"
                                style={{ color: "#E7EAEE" }}
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                </section>
            </div>
        </main>
    )
}

function MetricCell({ label, value, tint }: { label: string; value: number; tint?: string }) {
    return (
        <div className="px-5 py-4" style={{ background: "#090C10" }}>
            <p className="text-xs" style={{ color: "#6B7684" }}>
                {label}
            </p>
            <p
                className="mt-1.5 text-xl font-semibold tabular-nums"
                style={{
                    fontFamily: "'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace",
                    color: tint ?? "#E7EAEE"
                }}
            >
                {value.toLocaleString()}
            </p>
        </div>
    )
}

function UploadStat({ label, value }: { label: string; value: string }) {
    return (
        <div className="px-4 py-3" style={{ background: "#090C10" }}>
            <p className="text-[11px]" style={{ color: "#6B7684" }}>
                {label}
            </p>
            <p className="mt-1 text-sm font-medium" style={{ fontFamily: FONT_MONO }}>
                {value}
            </p>
        </div>
    )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-xs" style={{ color: "#6B7684" }}>
                {label}
            </span>
            {children}
        </label>
    )
}
