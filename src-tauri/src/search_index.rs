use std::fs;
use std::path::Path;

use tantivy::collector::TopDocs;
use tantivy::query::QueryParser;
use tantivy::schema::*;
use tantivy::{doc, Index, IndexReader, IndexWriter, ReloadPolicy, Term};

use crate::helpers::extract_snippet;
use crate::models::ContentSearchResult;

pub struct SearchIndex {
    reader: IndexReader,
    writer: IndexWriter,
    session_id_field: Field,
    user_messages_field: Field,
    assistant_text_field: Field,
    tool_inputs_field: Field,
    index: Index,
}

impl SearchIndex {
    pub fn open_or_create(dir: &Path) -> Result<Self, String> {
        let schema = Self::build_schema();
        let session_id_field = schema.get_field("session_id").unwrap();
        let user_messages_field = schema.get_field("user_messages").unwrap();
        let assistant_text_field = schema.get_field("assistant_text").unwrap();
        let tool_inputs_field = schema.get_field("tool_inputs").unwrap();

        fs::create_dir_all(dir).map_err(|e| format!("Failed to create index dir: {}", e))?;

        let index = if dir.join("meta.json").exists() {
            match Index::open_in_dir(dir) {
                Ok(idx) => idx,
                Err(_) => {
                    let _ = fs::remove_dir_all(dir);
                    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
                    Index::create_in_dir(dir, schema.clone())
                        .map_err(|e| format!("Failed to create index: {}", e))?
                }
            }
        } else {
            Index::create_in_dir(dir, schema.clone())
                .map_err(|e| format!("Failed to create index: {}", e))?
        };

        let writer = index
            .writer(50_000_000)
            .map_err(|e| format!("Failed to create index writer: {}", e))?;

        let reader = index
            .reader_builder()
            .reload_policy(ReloadPolicy::Manual)
            .try_into()
            .map_err(|e| format!("Failed to create index reader: {}", e))?;

        Ok(Self {
            reader,
            writer,
            session_id_field,
            user_messages_field,
            assistant_text_field,
            tool_inputs_field,
            index,
        })
    }

    pub fn index_session(
        &mut self,
        session_id: &str,
        user_messages: &[String],
        assistant_texts: &[String],
        tool_inputs: &[String],
    ) {
        self.writer
            .delete_term(Term::from_field_text(self.session_id_field, session_id));

        let user_msg_text = user_messages.join("\n");
        let asst_text = assistant_texts.join("\n");
        let tool_text = tool_inputs.join("\n");

        if let Err(e) = self.writer.add_document(doc!(
                self.session_id_field => session_id,
                self.user_messages_field => user_msg_text,
                self.assistant_text_field => asst_text,
                self.tool_inputs_field => tool_text,
        )) {
            tracing::warn!("Failed to index session {session_id}: {e}");
        }
    }

    pub fn delete_session(&mut self, session_id: &str) {
        self.writer
            .delete_term(Term::from_field_text(self.session_id_field, session_id));
    }

    pub fn commit_and_reload(&mut self) -> Result<(), String> {
        self.writer
            .commit()
            .map_err(|e| format!("Index commit failed: {}", e))?;
        self.reader
            .reload()
            .map_err(|e| format!("Index reload failed: {}", e))?;
        Ok(())
    }

    pub fn session_count(&self) -> u64 {
        self.reader.searcher().num_docs()
    }

    pub fn search(
        &self,
        query: &str,
        limit: usize,
    ) -> Result<Vec<ContentSearchResult>, String> {
        let searcher = self.reader.searcher();

        let mut parser = QueryParser::for_index(
            &self.index,
            vec![
                self.user_messages_field,
                self.assistant_text_field,
                self.tool_inputs_field,
            ],
        );
        parser.set_field_boost(self.user_messages_field, 3.0);
        parser.set_field_boost(self.assistant_text_field, 1.0);
        parser.set_field_boost(self.tool_inputs_field, 0.5);

        let parsed = parser
            .parse_query(query)
            .map_err(|e| format!("Query parse error: {}", e))?;

        let top_docs = searcher
            .search(&parsed, &TopDocs::with_limit(limit))
            .map_err(|e| format!("Search error: {}", e))?;

        let query_lower = query.to_lowercase();
        let mut results = Vec::new();

        for (score, doc_address) in top_docs {
            let doc: tantivy::TantivyDocument = searcher
                .doc(doc_address)
                .map_err(|e| format!("Doc fetch error: {}", e))?;

            let session_id = doc
                .get_first(self.session_id_field)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let user_msgs = doc
                .get_first(self.user_messages_field)
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let asst_text = doc
                .get_first(self.assistant_text_field)
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let tool_in = doc
                .get_first(self.tool_inputs_field)
                .and_then(|v| v.as_str())
                .unwrap_or("");

            let mut matched_fields = Vec::new();
            let mut best_snippet: Option<String> = None;

            if user_msgs.to_lowercase().contains(&query_lower) {
                matched_fields.push("user_messages".to_string());
                if best_snippet.is_none() {
                    best_snippet = Some(extract_snippet(user_msgs, &query_lower, 120));
                }
            }
            if asst_text.to_lowercase().contains(&query_lower) {
                matched_fields.push("assistant_text".to_string());
                if best_snippet.is_none() {
                    best_snippet = Some(extract_snippet(asst_text, &query_lower, 120));
                }
            }
            if tool_in.to_lowercase().contains(&query_lower) {
                matched_fields.push("tool_content".to_string());
                if best_snippet.is_none() {
                    best_snippet = Some(extract_snippet(tool_in, &query_lower, 120));
                }
            }

            results.push(ContentSearchResult {
                session_id,
                score: score as f64,
                matched_fields,
                snippet: best_snippet.unwrap_or_default(),
            });
        }

        Ok(results)
    }

    fn build_schema() -> Schema {
        let mut builder = Schema::builder();
        builder.add_text_field("session_id", STRING | STORED);
        builder.add_text_field("user_messages", TEXT | STORED);
        builder.add_text_field("assistant_text", TEXT | STORED);
        builder.add_text_field("tool_inputs", TEXT | STORED);
        builder.build()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::UNIX_EPOCH;

    fn unique_temp_dir() -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "cc-sessions-search-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn search_returns_indexed_sessions_with_matched_fields_and_snippets() {
        let dir = unique_temp_dir();
        let mut index = SearchIndex::open_or_create(&dir).unwrap();

        index.index_session(
            "session-1",
            &["please add tests".to_string()],
            &["the automated test suite now covers parsing".to_string()],
            &["pnpm test".to_string()],
        );
        index.index_session(
            "session-2",
            &["unrelated prompt".to_string()],
            &["nothing to see here".to_string()],
            &[],
        );
        index.commit_and_reload().unwrap();

        let results = index.search("automated", 10).unwrap();

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].session_id, "session-1");
        assert_eq!(results[0].matched_fields, vec!["assistant_text"]);
        assert!(results[0].snippet.contains("automated"));

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn delete_session_removes_documents_from_the_index() {
        let dir = unique_temp_dir();
        let mut index = SearchIndex::open_or_create(&dir).unwrap();

        index.index_session("session-1", &["delete me".to_string()], &[], &[]);
        index.commit_and_reload().unwrap();
        assert_eq!(index.session_count(), 1);

        index.delete_session("session-1");
        index.commit_and_reload().unwrap();

        assert_eq!(index.session_count(), 0);
        assert!(index.search("delete", 10).unwrap().is_empty());

        let _ = fs::remove_dir_all(dir);
    }
}
