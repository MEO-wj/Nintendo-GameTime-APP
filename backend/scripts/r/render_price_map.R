suppressPackageStartupMessages({
  library(jsonlite)
  library(leaflet)
  library(htmlwidgets)
})

raw <- paste(readLines(file("stdin"), warn = FALSE), collapse = "\n")
if (!nzchar(raw)) cat("{}") else {
payload <- fromJSON(raw, simplifyDataFrame = FALSE)

coords <- list(
  US = c(39.8, -98.5), JP = c(36.2, 138.3), HK = c(22.3, 114.2),
  KR = c(35.9, 127.8), GB = c(55.4, -3.4), EU = c(50.1, 14.4),
  AU = c(-25.3, 133.8), CA = c(56.1, -106.3), BR = c(-14.2, -51.9),
  MX = c(23.6, -102.6), NZ = c(-40.9, 174.9), NO = c(60.5, 8.5)
)

fx <- list(USD = 7.25, EUR = 7.9, JPY = 0.048, HKD = 0.93,
           KRW = 0.0053, GBP = 9.2, AUD = 4.7, CAD = 5.3,
           BRL = 1.4, MXN = 0.42, NZD = 4.3, NOK = 0.67, CNY = 1)

regions <- payload$prices
title_text <- if (!is.null(payload$title)) payload$title else "eShop Price Map"

to_cny <- function(price, currency) {
  rate <- fx[[currency]]
  if (is.null(rate)) rate <- 7.25
  price * rate
}

for (i in seq_along(regions)) {
  r <- regions[[i]]
  effective <- if (!is.null(r$salePrice) && isTRUE(r$onSale)) r$salePrice else r$price
  regions[[i]]$priceCny <- to_cny(effective, r$currency)
  regions[[i]]$originalCny <- to_cny(r$price, r$currency)
}

cny_prices <- sapply(regions, function(r) r$priceCny)
order_idx <- order(cny_prices)
regions <- regions[order_idx]

cheapest <- regions[[1]]
expensive <- regions[[length(regions)]]

color_for <- function(priceCny, minP, maxP) {
  if (maxP == minP) return("#3d8c7d")
  t <- max(0, min(1, (priceCny - minP) / (maxP - minP)))
  if (t < 0.5) {
    f <- t * 2
    r <- round(61 + (212 - 61) * f)
    g <- round(140 + (157 - 140) * f)
    b <- round(125 + (50 - 125) * f)
  } else {
    f <- (t - 0.5) * 2
    r <- round(212 + (208 - 212) * f)
    g <- round(157 + (91 - 157) * f)
    b <- round(50 + (59 - 50) * f)
  }
  sprintf("#%02x%02x%02x", r, g, b)
}

minP <- regions[[1]]$priceCny
maxP <- regions[[length(regions)]]$priceCny

make_popup <- function(r) {
  sale_html <- if (isTRUE(r$onSale) && !is.null(r$discountPercent))
    sprintf('<span style="background:#c05050;color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">-%d%%</span>', r$discountPercent)
  else ""

  price_str <- format(round(r$priceCny), big.mark = ",")
  price_html <- sprintf('<div style="font-size:22px;font-weight:800;color:#b24a28;margin:6px 0">%s%s</div>', "¥", price_str)

  orig_html <- if (isTRUE(r$onSale) && !is.null(r$salePrice))
    sprintf('<div style="color:#726459;font-size:12px;text-decoration:line-through">%s %.2f</div>', r$currency, r$price)
  else ""

  sprintf('<div style="font-family:-apple-system,sans-serif;min-width:160px;padding:4px">
    <div style="font-size:15px;font-weight:700;color:#241812;margin-bottom:4px">%s</div>
    <div style="color:#726459;font-size:12px;margin-bottom:6px">%s (%s)</div>
    %s %s %s
  </div>', r$label, r$country, r$currency, price_html, orig_html, sale_html)
}

m <- leaflet(options = leafletOptions(
  zoomControl = FALSE, attributionControl = FALSE,
  dragging = TRUE, scrollWheelZoom = TRUE
)) %>%
  addProviderTiles(providers$CartoDB.DarkMatter) %>%
  setView(lng = 40, lat = 25, zoom = 2)

for (r in regions) {
  key <- r$region
  latlng <- coords[[key]]
  if (is.null(latlng)) next
  clr <- color_for(r$priceCny, minP, maxP)
  is_cheap <- r$region == cheapest$region
  is_expensive <- r$region == expensive$region
  marker_size <- if (is_cheap || is_expensive) 16 else 10

  price_str <- format(round(r$priceCny), big.mark = ",")
  label_text <- sprintf("%s: %s%s", r$label, "¥", price_str)

  m <- m %>%
    addCircleMarkers(
      lng = latlng[2], lat = latlng[1],
      radius = marker_size,
      color = "#000", weight = 1.5, opacity = 0.6,
      fillColor = clr, fillOpacity = 0.85,
      popup = make_popup(r),
      label = label_text,
      labelOptions = labelOptions(
        style = list("font-weight" = "700", "font-size" = "13px",
                     "color" = "#241812", "background" = "rgba(255,250,243,0.95)")
      )
    )
}

cheapest_str <- format(round(cheapest$priceCny), big.mark = ",")
expensive_str <- format(round(expensive$priceCny), big.mark = ",")
legend_html <- sprintf('
<div style="position:fixed;bottom:24px;left:24px;background:rgba(36,24,18,0.92);
  backdrop-filter:blur(12px);border:1px solid rgba(178,74,40,0.3);
  border-radius:14px;padding:18px 22px;color:#f3ece2;font-family:-apple-system,sans-serif;z-index:999;max-width:320px">
  <div style="font-size:14px;font-weight:700;color:#f3ece2;margin-bottom:10px">%s</div>
  <div style="display:flex;gap:20px;margin-bottom:12px">
    <div>
      <div style="font-size:11px;color:#a89880;margin-bottom:2px">最低价</div>
      <div style="font-size:20px;font-weight:800;color:#3d8c7d">%s%s</div>
      <div style="font-size:12px;color:#d49d32">%s</div>
    </div>
    <div>
      <div style="font-size:11px;color:#a89880;margin-bottom:2px">最高价</div>
      <div style="font-size:20px;font-weight:800;color:#c05050">%s%s</div>
      <div style="font-size:12px;color:#d49d32">%s</div>
    </div>
    <div>
      <div style="font-size:11px;color:#a89880;margin-bottom:2px">区域数</div>
      <div style="font-size:20px;font-weight:800;color:#d49d32">%d</div>
    </div>
  </div>
  <div style="height:6px;border-radius:3px;background:linear-gradient(to right,#3d8c7d,#d49d32,#c05050);margin:8px 0"></div>
  <div style="font-size:10px;color:#726459">绿色 = 低价 · 红色 = 高价 · 点击标记查看详情</div>
</div>',
  title_text,
  "¥", cheapest_str, cheapest$label,
  "¥", expensive_str, expensive$label,
  length(regions))

m <- m %>% addControl(html = legend_html, position = "bottomleft")

tmp <- tempfile(fileext = ".html")
saveWidget(m, tmp, selfcontained = TRUE)
html_content <- paste(readLines(tmp, warn = FALSE), collapse = "\n")
unlink(tmp)

cat(toJSON(list(html = html_content), auto_unbox = TRUE))
}