package handler

import "testing"

func TestBackupSchemaMatchesCurrentSecurityFields(t *testing.T) {
	for _, table := range backupTables {
		if table == "commenter_blocks" {
			t.Fatal("removed legacy table must not be included in backups")
		}
	}

	required := map[string][]string{
		"posts":    {"password_hash", "password_hint"},
		"passkeys": {"credential_id", "public_key", "credential_data", "sign_count", "aaguid"},
		"tags":     {"sort_order"},
	}
	for table, columns := range required {
		allowed := make(map[string]bool)
		for _, column := range restoreSafeColumns[table] {
			allowed[column] = true
		}
		for _, column := range columns {
			if !allowed[column] {
				t.Fatalf("%s.%s is missing from restore allowlist", table, column)
			}
		}
	}
}
