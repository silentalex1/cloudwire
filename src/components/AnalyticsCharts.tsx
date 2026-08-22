import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar,
  CartesianGrid, Legend, LineChart, Line
} from "recharts"

interface AnalyticsChartsProps {
  trafficData: any[]
  threatsData: any[]
}

export default function AnalyticsCharts({ trafficData, threatsData }: AnalyticsChartsProps) {
  return (
    <>
      <div className="rounded-xl border border-[#1f1f2a] bg-[#0c0c0f] p-6">
        <h3 className="font-semibold">Traffic (24h)</h3>
        <div className="mt-4 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trafficData}>
              <defs>
                <linearGradient id="colorTraffic" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f1f2a" />
              <XAxis dataKey="t" stroke="#9494a8" fontSize={12} />
              <YAxis stroke="#9494a8" fontSize={12} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0c0c0f', border: '1px solid #1f1f2a', borderRadius: '8px' }}
                itemStyle={{ color: '#fff' }}
              />
              <Area type="monotone" dataKey="req" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorTraffic)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-[#1f1f2a] bg-[#0c0c0f] p-6">
        <h3 className="font-semibold">Threats blocked (24h)</h3>
        <div className="mt-4 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={threatsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f1f2a" />
              <XAxis dataKey="name" stroke="#9494a8" fontSize={12} />
              <YAxis stroke="#9494a8" fontSize={12} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0c0c0f', border: '1px solid #1f1f2a', borderRadius: '8px' }}
                itemStyle={{ color: '#fff' }}
              />
              <Bar dataKey="count" fill="#f43f5e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  )
}
