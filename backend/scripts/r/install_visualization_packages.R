packages <- c("jsonlite", "echarts4r", "leaflet", "htmlwidgets")

# Retry logic for network failures
install_with_retry <- function(pkgs, max_retries = 3) {
  for (pkg in pkgs) {
    installed <- FALSE
    for (attempt in 1:max_retries) {
      tryCatch({
        install.packages(pkg, repos = "https://cloud.r-project.org")
        if (pkg %in% rownames(installed.packages())) {
          installed <- TRUE
          break
        }
      }, error = function(e) {
        message(sprintf("Attempt %d/%d failed for %s: %s", attempt, max_retries, pkg, e$message))
        Sys.sleep(5)
      })
    }
    if (!installed) {
      message(sprintf("WARNING: Failed to install %s after %d attempts", pkg, max_retries))
    }
  }
}

missing <- packages[!packages %in% rownames(installed.packages())]
if (length(missing) > 0) {
  install_with_retry(missing)
}

message("R visualization packages are ready: ", paste(packages, collapse = ", "))
