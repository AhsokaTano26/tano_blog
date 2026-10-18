package handler

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/testutil"
)

func TestTagDeleteHandlerRemovesAssociations(t *testing.T) {
	for _, foreignKey := range []bool{false, true} {
		t.Run(fmt.Sprintf("foreign-key-%v", foreignKey), func(t *testing.T) {
			db := testutil.Database(t)
			if err := db.Exec("CREATE TABLE tags (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, slug text, sort_order integer, created_at timestamptz)").Error; err != nil {
				t.Fatal(err)
			}
			query := "CREATE TABLE post_tags (post_id uuid, tag_id uuid"
			if foreignKey {
				query += " REFERENCES tags(id)"
			}
			if err := db.Exec(query + ")").Error; err != nil {
				t.Fatal(err)
			}
			tag := model.Tag{Name: "remove", Slug: "remove"}
			contentCreate(t, db, &tag)
			if err := db.Exec("INSERT INTO post_tags VALUES (?, ?)", uuid.New(), tag.ID).Error; err != nil {
				t.Fatal(err)
			}
			w := contentCall(t, model.User{}, NewTagHandler(db).Delete, http.MethodDelete, "/"+tag.ID.String(), "")
			if w.Code != http.StatusOK {
				t.Fatalf("tag delete failed: %d %s", w.Code, w.Body)
			}
			for _, table := range []string{"tags", "post_tags"} {
				var count int64
				if err := db.Table(table).Count(&count).Error; err != nil || count != 0 {
					t.Errorf("delete left %s rows=%d error=%v", table, count, err)
				}
			}
		})
	}
}

func TestTagDeleteHandlerRollsBackAssociationsOnFailure(t *testing.T) {
	db := testutil.Database(t)
	if err := db.Exec("CREATE TABLE tags (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, slug text, sort_order integer, created_at timestamptz)").Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec("CREATE TABLE post_tags (post_id uuid, tag_id uuid)").Error; err != nil {
		t.Fatal(err)
	}
	tag := model.Tag{Name: "keep", Slug: "keep"}
	contentCreate(t, db, &tag)
	if err := db.Exec("INSERT INTO post_tags VALUES (?, ?)", uuid.New(), tag.ID).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`CREATE FUNCTION reject_tag_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected tag failure'; END $$`).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`CREATE TRIGGER reject_tag_delete BEFORE DELETE ON tags FOR EACH ROW EXECUTE FUNCTION reject_tag_delete()`).Error; err != nil {
		t.Fatal(err)
	}
	w := contentCall(t, model.User{}, NewTagHandler(db).Delete, http.MethodDelete, "/"+tag.ID.String(), "")
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("tag failure status=%d %s", w.Code, w.Body)
	}
	for _, table := range []string{"tags", "post_tags"} {
		var count int64
		if err := db.Table(table).Count(&count).Error; err != nil || count != 1 {
			t.Errorf("failed delete changed %s rows=%d error=%v", table, count, err)
		}
	}
}

func TestNavReorderRejectsInvalidIDsAtomically(t *testing.T) {
	for _, invalid := range []string{"not-a-uuid", uuid.NewString(), "duplicate"} {
		t.Run(invalid, func(t *testing.T) {
			db := testutil.Database(t, &model.NavLink{})
			link := model.NavLink{Title: "keep", URL: "/keep", SortOrder: 12}
			contentCreate(t, db, &link)
			if invalid == "duplicate" {
				invalid = link.ID.String()
			}
			body := fmt.Sprintf(`{"ids":[%q,%q]}`, link.ID.String(), invalid)
			w := contentCall(t, model.User{}, NewNavLinkHandler(db).AdminReorder, http.MethodPut, "/reorder", body)
			if w.Code < 400 || w.Code >= 500 {
				t.Fatalf("invalid reorder status=%d %s", w.Code, w.Body)
			}
			var current model.NavLink
			if err := db.First(&current, "id = ?", link.ID).Error; err != nil || current.SortOrder != 12 {
				t.Fatalf("invalid reorder changed prior rows: order=%d err=%v", current.SortOrder, err)
			}
		})
	}
}

func TestNavReorderRollsBackFailedUpdate(t *testing.T) {
	db := testutil.Database(t, &model.NavLink{})
	first := model.NavLink{Title: "first", URL: "/first", SortOrder: 12}
	second := model.NavLink{Title: "blocked", URL: "/blocked", SortOrder: 13}
	contentCreate(t, db, &first)
	contentCreate(t, db, &second)
	if err := db.Exec(`CREATE FUNCTION reject_nav_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.title = 'blocked' THEN RAISE EXCEPTION 'injected reorder failure'; END IF; RETURN NEW; END $$`).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`CREATE TRIGGER reject_nav_order BEFORE UPDATE ON nav_links FOR EACH ROW EXECUTE FUNCTION reject_nav_order()`).Error; err != nil {
		t.Fatal(err)
	}
	body := fmt.Sprintf(`{"ids":[%q,%q]}`, first.ID.String(), second.ID.String())
	w := contentCall(t, model.User{}, NewNavLinkHandler(db).AdminReorder, http.MethodPut, "/reorder", body)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("failed reorder returned %d %s", w.Code, w.Body)
	}
	var current model.NavLink
	if err := db.First(&current, "id = ?", first.ID).Error; err != nil || current.SortOrder != 12 {
		t.Fatalf("failed reorder committed earlier row: order=%d err=%v", current.SortOrder, err)
	}
}
