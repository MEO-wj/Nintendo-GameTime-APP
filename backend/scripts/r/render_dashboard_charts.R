suppressPackageStartupMessages({
  library(jsonlite)
  library(echarts4r)
})

palette <- c("#d05b3b", "#d49d32", "#3d8c7d", "#3b6fd0", "#8753c7", "#c0508f")
paper_background <- "rgba(255,250,243,0)"
ink <- "#241812"
muted <- "#726459"

read_payload <- function() {
  raw <- paste(readLines(file("stdin"), warn = FALSE), collapse = "\n")
  if (!nzchar(raw)) {
    return(list(donut = data.frame(), ranking = data.frame()))
  }
  fromJSON(raw, simplifyDataFrame = TRUE)
}

normalize_chart_frame <- function(value) {
  if (is.null(value) || length(value) == 0) {
    return(data.frame(gameId = character(), name = character(), minutes = numeric()))
  }

  frame <- as.data.frame(value, stringsAsFactors = FALSE)
  if (!"gameId" %in% names(frame)) frame$gameId <- character(nrow(frame))
  if (!"name" %in% names(frame)) frame$name <- character(nrow(frame))
  if (!"minutes" %in% names(frame)) frame$minutes <- numeric(nrow(frame))

  frame$gameId <- as.character(frame$gameId)
  frame$name <- as.character(frame$name)
  frame$minutes <- as.numeric(frame$minutes)
  frame[is.na(frame$minutes), "minutes"] <- 0
  frame[frame$minutes > 0, , drop = FALSE]
}

hours <- function(minutes) {
  round(minutes / 60, 1)
}

palette_at <- function(index) {
  palette[((index - 1) %% length(palette)) + 1]
}

pie_data <- function(frame) {
  lapply(seq_len(nrow(frame)), function(index) {
    list(
      name = frame$name[[index]],
      value = frame$minutes[[index]],
      gameId = frame$gameId[[index]],
      hours = hours(frame$minutes[[index]])
    )
  })
}

bar_data <- function(frame) {
  lapply(seq_len(nrow(frame)), function(index) {
    color <- palette_at(index)
    list(
      value = frame$minutes[[index]],
      gameId = frame$gameId[[index]],
      hours = hours(frame$minutes[[index]]),
      itemStyle = list(
        color = list(
          type = "linear",
          x = 0,
          y = 0,
          x2 = 1,
          y2 = 0,
          colorStops = list(
            list(offset = 0, color = color),
            list(offset = 1, color = paste0(color, "cc"))
          )
        ),
        borderRadius = c(0, 999, 999, 0)
      )
    )
  })
}

treemap_data <- function(frame) {
  lapply(seq_len(nrow(frame)), function(index) {
    list(
      name = frame$name[[index]],
      value = frame$minutes[[index]],
      gameId = frame$gameId[[index]],
      itemStyle = list(color = palette_at(index))
    )
  })
}

build_options <- function(donut, ranking) {
  total_minutes <- sum(donut$minutes)

  list(
    playtimeDonut = list(
      title = "累计游玩占比",
      option = list(
        backgroundColor = paper_background,
        color = palette,
        tooltip = list(
          trigger = "item",
          formatter = "{b}<br/>{c} 分钟 ({d}%)"
        ),
        legend = list(
          bottom = 0,
          textStyle = list(color = muted)
        ),
        series = list(
          list(
            name = "累计时长",
            type = "pie",
            radius = c("48%", "74%"),
            center = c("50%", "45%"),
            roseType = "radius",
            avoidLabelOverlap = TRUE,
            itemStyle = list(
              borderRadius = 14,
              borderColor = "#fffaf3",
              borderWidth = 3
            ),
            label = list(
              color = ink,
              formatter = "{b}\n{d}%"
            ),
            emphasis = list(
              scale = TRUE,
              scaleSize = 10
            ),
            data = pie_data(donut)
          )
        ),
        graphic = list(
          list(
            type = "text",
            left = "center",
            top = "40%",
            style = list(
              text = paste0(hours(total_minutes), "h"),
              fill = ink,
              fontSize = 30,
              fontWeight = 800,
              textAlign = "center"
            )
          ),
          list(
            type = "text",
            left = "center",
            top = "50%",
            style = list(
              text = "Top games",
              fill = muted,
              fontSize = 13,
              textAlign = "center"
            )
          )
        )
      )
    ),
    playtimeRanking = list(
      title = "游玩时长排行",
      option = list(
        backgroundColor = paper_background,
        color = palette,
        grid = list(
          left = 12,
          right = 28,
          top = 18,
          bottom = 22,
          containLabel = TRUE
        ),
        tooltip = list(
          trigger = "axis",
          axisPointer = list(type = "shadow"),
          formatter = "{b}<br/>{c} 分钟"
        ),
        xAxis = list(
          type = "value",
          axisLabel = list(color = muted),
          splitLine = list(lineStyle = list(color = "rgba(49,36,22,0.08)"))
        ),
        yAxis = list(
          type = "category",
          inverse = TRUE,
          data = ranking$name,
          axisLabel = list(color = ink, width = 140, overflow = "truncate"),
          axisLine = list(show = FALSE),
          axisTick = list(show = FALSE)
        ),
        series = list(
          list(
            name = "累计时长",
            type = "bar",
            barWidth = 14,
            data = bar_data(ranking),
            emphasis = list(focus = "series")
          )
        ),
        dataZoom = list(
          list(
            type = "inside",
            yAxisIndex = 0,
            zoomOnMouseWheel = FALSE,
            moveOnMouseWheel = TRUE
          )
        )
      )
    ),
    playtimeTreemap = list(
      title = "游戏库时长地图",
      option = list(
        backgroundColor = paper_background,
        color = palette,
        tooltip = list(formatter = "{b}<br/>{c} 分钟"),
        series = list(
          list(
            type = "treemap",
            roam = FALSE,
            nodeClick = "link",
            breadcrumb = list(show = FALSE),
            label = list(color = "#fffaf3", fontWeight = 700),
            upperLabel = list(show = FALSE),
            itemStyle = list(
              borderColor = "#fffaf3",
              borderWidth = 3,
              gapWidth = 3,
              borderRadius = 12
            ),
            levels = list(
              list(
                itemStyle = list(
                  borderColor = "#fffaf3",
                  borderWidth = 3,
                  gapWidth = 3
                )
              )
            ),
            data = treemap_data(ranking)
          )
        )
      )
    )
  )
}

payload <- read_payload()
donut <- normalize_chart_frame(payload$donut)
ranking <- normalize_chart_frame(payload$ranking)

result <- list(
  engine = "r-echarts4r",
  generatedAt = format(Sys.time(), "%Y-%m-%dT%H:%M:%OS3Z", tz = "UTC"),
  options = build_options(donut, ranking)
)

cat(toJSON(result, auto_unbox = TRUE, null = "null", digits = NA))
