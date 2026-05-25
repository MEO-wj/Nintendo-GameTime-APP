import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AppEnv } from "../config/env.js";

export interface DashboardChartDatum {
  gameId: string;
  name: string;
  minutes: number;
}

export interface EChartsOptionPayload {
  title: string;
  option: Record<string, unknown>;
}

export interface DashboardVisualizations {
  engine: "r-echarts4r" | "typescript-fallback";
  generatedAt: string;
  options: {
    playtimeDonut: EChartsOptionPayload;
    playtimeRanking: EChartsOptionPayload;
    playtimeTreemap: EChartsOptionPayload;
  };
  warning?: string;
}

export interface VisualizationService {
  createDashboardVisualizations(input: {
    donut: DashboardChartDatum[];
    ranking: DashboardChartDatum[];
  }): Promise<DashboardVisualizations>;
}

const PLAYTIME_PALETTE = ["#d05b3b", "#d49d32", "#3d8c7d", "#3b6fd0", "#8753c7", "#c0508f"];
const PAPER_BACKGROUND = "rgba(255,250,243,0)";
const INK = "#241812";
const MUTED = "#726459";

function minutesToHours(minutes: number): number {
  return Number((minutes / 60).toFixed(1));
}

function createFallbackDashboardVisualizations(
  input: { donut: DashboardChartDatum[]; ranking: DashboardChartDatum[] },
  warning?: string
): DashboardVisualizations {
  const ranking = input.ranking.filter((entry) => entry.minutes > 0);
  const donut = input.donut.filter((entry) => entry.minutes > 0);
  const totalMinutes = donut.reduce((sum, entry) => sum + entry.minutes, 0);

  return {
    engine: "typescript-fallback",
    generatedAt: new Date().toISOString(),
    warning,
    options: {
      playtimeDonut: {
        title: "累计游玩占比",
        option: {
          backgroundColor: PAPER_BACKGROUND,
          color: PLAYTIME_PALETTE,
          tooltip: {
            trigger: "item",
            formatter: "{b}<br/>{c} 分钟 ({d}%)"
          },
          legend: {
            bottom: 0,
            textStyle: { color: MUTED }
          },
          series: [
            {
              name: "累计时长",
              type: "pie",
              radius: ["48%", "74%"],
              center: ["50%", "45%"],
              roseType: "radius",
              avoidLabelOverlap: true,
              itemStyle: {
                borderRadius: 14,
                borderColor: "#fffaf3",
                borderWidth: 3
              },
              label: {
                color: INK,
                formatter: "{b}\n{d}%"
              },
              emphasis: {
                scale: true,
                scaleSize: 10
              },
              data: donut.map((entry) => ({
                name: entry.name,
                value: entry.minutes,
                gameId: entry.gameId,
                hours: minutesToHours(entry.minutes)
              }))
            }
          ],
          graphic: [
            {
              type: "text",
              left: "center",
              top: "40%",
              style: {
                text: `${minutesToHours(totalMinutes)}h`,
                fill: INK,
                fontSize: 30,
                fontWeight: 800,
                textAlign: "center"
              }
            },
            {
              type: "text",
              left: "center",
              top: "50%",
              style: {
                text: "Top games",
                fill: MUTED,
                fontSize: 13,
                textAlign: "center"
              }
            }
          ]
        }
      },
      playtimeRanking: {
        title: "游玩时长排行",
        option: {
          backgroundColor: PAPER_BACKGROUND,
          color: PLAYTIME_PALETTE,
          grid: {
            left: 12,
            right: 28,
            top: 18,
            bottom: 22,
            containLabel: true
          },
          tooltip: {
            trigger: "axis",
            axisPointer: { type: "shadow" },
            formatter: "{b}<br/>{c} 分钟"
          },
          xAxis: {
            type: "value",
            axisLabel: { color: MUTED },
            splitLine: { lineStyle: { color: "rgba(49,36,22,0.08)" } }
          },
          yAxis: {
            type: "category",
            inverse: true,
            data: ranking.map((entry) => entry.name),
            axisLabel: { color: INK, width: 140, overflow: "truncate" },
            axisLine: { show: false },
            axisTick: { show: false }
          },
          series: [
            {
              name: "累计时长",
              type: "bar",
              barWidth: 14,
              data: ranking.map((entry, index) => ({
                value: entry.minutes,
                gameId: entry.gameId,
                hours: minutesToHours(entry.minutes),
                itemStyle: {
                  color: {
                    type: "linear",
                    x: 0,
                    y: 0,
                    x2: 1,
                    y2: 0,
                    colorStops: [
                      { offset: 0, color: PLAYTIME_PALETTE[index % PLAYTIME_PALETTE.length] },
                      { offset: 1, color: `${PLAYTIME_PALETTE[index % PLAYTIME_PALETTE.length]}cc` }
                    ]
                  },
                  borderRadius: [0, 999, 999, 0]
                }
              })),
              emphasis: { focus: "series" }
            }
          ],
          dataZoom: [
            {
              type: "inside",
              yAxisIndex: 0,
              zoomOnMouseWheel: false,
              moveOnMouseWheel: true
            }
          ]
        }
      },
      playtimeTreemap: {
        title: "游戏库时长地图",
        option: {
          backgroundColor: PAPER_BACKGROUND,
          color: PLAYTIME_PALETTE,
          tooltip: {
            formatter: "{b}<br/>{c} 分钟"
          },
          series: [
            {
              type: "treemap",
              roam: false,
              nodeClick: "link",
              breadcrumb: { show: false },
              label: {
                color: "#fffaf3",
                fontWeight: 700
              },
              upperLabel: { show: false },
              itemStyle: {
                borderColor: "#fffaf3",
                borderWidth: 3,
                gapWidth: 3,
                borderRadius: 12
              },
              levels: [
                {
                  itemStyle: {
                    borderColor: "#fffaf3",
                    borderWidth: 3,
                    gapWidth: 3
                  }
                }
              ],
              data: ranking.map((entry, index) => ({
                name: entry.name,
                value: entry.minutes,
                gameId: entry.gameId,
                itemStyle: {
                  color: PLAYTIME_PALETTE[index % PLAYTIME_PALETTE.length]
                }
              }))
            }
          ]
        }
      }
    }
  };
}

function getRScriptPath(): string {
  const relativeScriptPath = path.join("scripts", "r", "render_dashboard_charts.R");
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), relativeScriptPath),
    path.resolve(process.cwd(), "apps", "api", relativeScriptPath),
    path.resolve(moduleDir, "..", "..", relativeScriptPath)
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

function runRVisualizationRenderer(input: { donut: DashboardChartDatum[]; ranking: DashboardChartDatum[] }, env: AppEnv) {
  return new Promise<DashboardVisualizations>((resolve, reject) => {
    const scriptPath = getRScriptPath();
    if (!existsSync(scriptPath)) {
      reject(new Error(`R visualization script not found: ${scriptPath}`));
      return;
    }

    const child = spawn(env.R_VISUALIZATION_BIN, [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`R visualization renderer timed out after ${env.R_VISUALIZATION_TIMEOUT_MS}ms`));
    }, env.R_VISUALIZATION_TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `R visualization renderer exited with code ${code}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout) as DashboardVisualizations;
        resolve(parsed);
      } catch (error) {
        reject(error);
      }
    });

    child.stdin.end(JSON.stringify(input));
  });
}

export function createVisualizationService(env: AppEnv): VisualizationService {
  return {
    async createDashboardVisualizations(input) {
      if (!env.R_VISUALIZATION_ENABLED) {
        return createFallbackDashboardVisualizations(input, "R visualization renderer is disabled.");
      }

      try {
        return await runRVisualizationRenderer(input, env);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown R visualization renderer error";
        return createFallbackDashboardVisualizations(input, message);
      }
    }
  };
}
