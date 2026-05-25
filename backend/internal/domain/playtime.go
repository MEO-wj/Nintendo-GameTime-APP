package domain

// CalculateEffectivePlaytime computes effective playtime from official snapshots + corrections.
func CalculateEffectivePlaytime(snapshots []OfficialSnapshotRow, corrections []CorrectionRow) EffectivePlaytime {
	if len(snapshots) == 0 && len(corrections) == 0 {
		return EffectivePlaytime{}
	}

	// Find latest snapshot
	var latestSnap *OfficialSnapshotRow
	for i := range snapshots {
		s := &snapshots[i]
		if latestSnap == nil || s.CapturedAt.After(latestSnap.CapturedAt) {
			latestSnap = s
		}
	}

	official := 0
	if latestSnap != nil && latestSnap.PlayedMinutes != nil {
		official = *latestSnap.PlayedMinutes
	}

	// Sum active corrections
	delta := 0
	hasCorrection := false
	for _, c := range corrections {
		if c.RevokedAt != nil || c.DeletedAt != nil {
			continue
		}
		hasCorrection = true
		switch c.Type {
		case "SET_TOTAL":
			official = 0 // reset official, treat as manual
			delta += c.Minutes
		case "ADD_DELTA":
			delta += c.Minutes
		}
	}

	total := official + delta
	source := "official"
	if latestSnap == nil && hasCorrection {
		source = "manual-only"
	} else if hasCorrection {
		source = "corrected"
	}

	updatedAt := ""
	if latestSnap != nil {
		updatedAt = latestSnap.CapturedAt.Format("2006-01-02T15:04:05Z")
	}

	return EffectivePlaytime{
		GameID:                "",
		OfficialMinutes:       official,
		CorrectionDeltaMinutes: delta,
		TotalMinutes:          total,
		Source:                source,
		UpdatedAt:             updatedAt,
	}
}

// CalculateEffectivePlaytimeMap computes effective playtime for multiple games.
func CalculateEffectivePlaytimeMap(snapshots []OfficialSnapshotRow, corrections []CorrectionRow) map[string]EffectivePlaytime {
	snapByGame := make(map[string][]OfficialSnapshotRow)
	for _, s := range snapshots {
		snapByGame[s.GameID] = append(snapByGame[s.GameID], s)
	}
	corrByGame := make(map[string][]CorrectionRow)
	for _, c := range corrections {
		corrByGame[c.GameID] = append(corrByGame[c.GameID], c)
	}

	result := make(map[string]EffectivePlaytime)
	for gameID := range snapByGame {
		pt := CalculateEffectivePlaytime(snapByGame[gameID], corrByGame[gameID])
		pt.GameID = gameID
		result[gameID] = pt
	}
	for gameID := range corrByGame {
		if _, exists := result[gameID]; !exists {
			pt := CalculateEffectivePlaytime(nil, corrByGame[gameID])
			pt.GameID = gameID
			result[gameID] = pt
		}
	}
	return result
}
