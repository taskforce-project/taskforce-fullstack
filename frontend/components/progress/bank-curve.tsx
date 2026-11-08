"use client"

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import type { BankCurve, CurvePoint } from "@/lib/progress/bank-history"

/** Une couleur par modèle, celles des graphiques de l'app ; au-delà de cinq, elles reviennent. */
const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]

const dayOfTime = (at: number): string =>
  new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })

/**
 * La courbe de la banque d'évaluations (R61, R118, R125) : la part des cas réussis à chaque rejeu fini, une ligne par
 * modèle, dans le temps. Une lecture, pas un classement : la légende suit l'ordre où chaque modèle a été rejoué.
 */
export function BankCurveChart({ curve, label, passedText }: Readonly<{
  curve: BankCurve
  label: string
  /** « {passed} of {total} passed », pour la bulle d'un point. */
  passedText: (point: CurvePoint) => string
}>) {
  return (
    <figure aria-label={label} className="flex flex-col gap-2">
      <figcaption className="text-[11px] text-muted-foreground">{label}</figcaption>
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={[...curve.points]} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="at"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={dayOfTime}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              stroke="var(--border)"
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 50, 100]}
              tickFormatter={(value: number) => `${value}%`}
              width={36}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              stroke="var(--border)"
            />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                fontSize: 11,
                padding: "4px 8px",
              }}
              labelFormatter={(at) => dayOfTime(Number(at))}
              formatter={(value, name, item) => [`${String(value)}% · ${passedText(item.payload as CurvePoint)}`, name]}
              cursor={false}
            />
            {curve.series.map((series, index) => (
              <Line
                key={series.key}
                type="monotone"
                dataKey={(point: CurvePoint) => point.rates[series.key]}
                name={series.model}
                stroke={COLORS[index % COLORS.length]}
                strokeWidth={2}
                dot={{ r: 2.5, fill: COLORS[index % COLORS.length] }}
                activeDot={{ r: 3.5 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {curve.series.map((series, index) => (
          <li key={series.key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span aria-hidden className="size-2 rounded-full" style={{ background: COLORS[index % COLORS.length] }} />
            <span className="font-mono text-foreground">{series.model}</span>
          </li>
        ))}
      </ul>
    </figure>
  )
}
