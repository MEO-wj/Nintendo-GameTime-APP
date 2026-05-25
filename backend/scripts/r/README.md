# R visualizations

The API can use R to generate ECharts option JSON for dashboard charts.

Install the R dependencies once:

```powershell
Rscript .\scripts\r\install_visualization_packages.R
```

The renderer reads chart data from stdin and writes ECharts options to stdout:

```powershell
'{"donut":[],"ranking":[]}' | Rscript .\scripts\r\render_dashboard_charts.R
```

If `Rscript` or the R packages are unavailable, the Node API falls back to a TypeScript renderer with the same response shape.
