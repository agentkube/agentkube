import { TrendingUp } from "lucide-react"
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart"
import { DailyCost } from '@/types/opencost'

interface DailyCostTrendProps {
  dailyCostData: DailyCost[]
}

const chartConfig = {
  activeCost: {
    label: "Active",
    color: "hsl(var(--chart-1))",
  },
  idleCost: {
    label: "Idle",
    color: "#707277",
  },
} satisfies ChartConfig

const DailyCostTrend: React.FC<DailyCostTrendProps> = ({ dailyCostData }) => {
  const formattedData = dailyCostData.map(item => {
    const dateObj = new Date(item.date)
    const formattedDate = dateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    })

    return {
      ...item,
      formattedDate,
      activeCost: item.activeCost || 0,
      idleCost: item.idleCost || 0,
      totalCost: item.totalCost || (item.activeCost || 0) + (item.idleCost || 0)
    }
  })

  // Custom tooltip to format the values properly
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-card/50 backdrop-blur-md p-4 border border-gray-200 dark:border-gray-700 rounded shadow-md min-w-[150px]">
          <p className="font-medium text-lg font-[Anton] uppercase text-gray-800/40 dark:text-white">{label}</p>
          <div className="flex justify-between gap-2">
            <p className="text-sm text-green-600 dark:text-green-400">
              Active:
            </p>
            <p className="text-sm text-green-600 dark:text-green-400">
              ${payload[0].value.toFixed(2)}
            </p>
          </div>
          <div className="flex justify-between gap-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Idle:
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              ${payload[1].value.toFixed(2)}
            </p>
          </div>
          <div className="flex justify-between gap-2">
            <p className="text-sm font-bold text-gray-900 dark:text-white">
              Total:
            </p>
            <p className="text-sm font-bold text-gray-900 dark:text-white">
              ${(payload[0].value + payload[1].value).toFixed(2)}
            </p>
          </div>
        </div>
      )
    }
    return null
  }

  return (
    <Card className="bg-transparent dark:bg-transparent border border-gray-200 dark:border-gray-700/40">
      <CardContent className="p-0 pt-10">
        <ChartContainer config={chartConfig}>
          <BarChart
            data={formattedData}
            margin={{ top: 10, right: 10, left: 0, bottom: 10 }}

          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="formattedDate"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `$${value.toFixed(0)}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar
              dataKey="activeCost"
              stackId="a"
              fill="#6875F5"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="idleCost"
              stackId="a"
              fill="#707277"
              radius={[10, 10, 0, 0]}
              opacity={0.2}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export default DailyCostTrend