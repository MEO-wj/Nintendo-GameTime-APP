packages <- c("jsonlite", "echarts4r")
missing <- packages[!packages %in% rownames(installed.packages())]

if (length(missing) > 0) {
  install.packages(missing, repos = "https://cloud.r-project.org")
}

message("R visualization packages are ready: ", paste(packages, collapse = ", "))
