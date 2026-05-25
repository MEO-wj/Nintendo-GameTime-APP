package rvis

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"time"

	"nintendo-gametime/internal/config"
)

type Service struct {
	cfg *config.Config
}

func NewService(cfg *config.Config) *Service {
	return &Service{cfg: cfg}
}

type ChartOutput struct {
	Donut   interface{} `json:"donut"`
	Ranking interface{} `json:"ranking"`
	Treemap interface{} `json:"treemap,omitempty"`
}

// Render attempts R visualization, falling back to raw data on failure.
func (s *Service) Render(donut, ranking interface{}) (interface{}, error) {
	if !s.cfg.REnabled {
		return s.fallback(donut, ranking), nil
	}

	input := map[string]interface{}{
		"donut":   donut,
		"ranking": ranking,
	}
	inputJSON, err := json.Marshal(input)
	if err != nil {
		return s.fallback(donut, ranking), nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), s.cfg.RTimeout)
	defer cancel()

	scriptPath := "scripts/render_dashboard_charts.R"
	cmd := exec.CommandContext(ctx, s.cfg.RBin, scriptPath)
	cmd.Stdin = bytes.NewReader(inputJSON)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		fmt.Printf("[RVIS] R script failed: %v\nstderr: %s\n", err, stderr.String())
		return s.fallback(donut, ranking), nil
	}

	var result interface{}
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		return s.fallback(donut, ranking), nil
	}
	return result, nil
}

func (s *Service) fallback(donut, ranking interface{}) map[string]interface{} {
	// TypeScript-equivalent ECharts option generation
	colors := []string{"#d05b3b", "#d49d32", "#3d8c7d", "#3b6fd0", "#8753c7", "#c0508f"}

	donutOption := map[string]interface{}{
		"tooltip": map[string]interface{}{"trigger": "item"},
		"color":   colors,
		"series": []interface{}{
			map[string]interface{}{
				"type":       "pie",
				"radius":     []string{"40%", "70%"},
				"avoidLabelOverlap": false,
				"itemStyle":  map[string]interface{}{"borderRadius": 10, "borderColor": "#fff", "borderWidth": 2},
				"label":      map[string]interface{}{"show": false},
				"emphasis":   map[string]interface{}{"label": map[string]interface{}{"show": true, "fontSize": 14}},
				"data":       donut,
			},
		},
	}

	rankingOption := map[string]interface{}{
		"tooltip": map[string]interface{}{"trigger": "axis"},
		"color":   []string{colors[0]},
		"xAxis":   map[string]interface{}{"type": "value"},
		"yAxis":   map[string]interface{}{"type": "category", "data": nil},
		"series":  []interface{}{map[string]interface{}{"type": "bar", "data": nil}},
	}

	return map[string]interface{}{
		"donut":   donutOption,
		"ranking": rankingOption,
		"renderedAt": time.Now().UTC().Format(time.RFC3339),
		"engine":  "typescript",
	}
}
