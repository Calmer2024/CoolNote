//! Isolated audit: same record, filesystem and fsync, varying only serialization IO.
use coolnote_lib::infrastructure::recovery_store::{RecoveryRecord, RecoveryStore};
use serde_json::json;
use std::{io::Write, time::Instant};
use uuid::Uuid;
fn report(name: &str, values: &mut [f64]) {
    values.sort_by(f64::total_cmp);
    println!(
        "metric={name} n={} median_ms={:.2} p95_ms={:.2}",
        values.len(),
        values[values.len() / 2],
        values[((values.len() as f64 * 0.95).ceil() as usize) - 1]
    );
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = tempfile::tempdir()?;
    let recovery = RecoveryStore::new(root.path().into())?;
    for count in [10, 1000, 5000] {
        let record = RecoveryRecord {
            library_id: Uuid::new_v4().to_string(),
            note_id: Uuid::new_v4().to_string(),
            client_transaction_id: Uuid::new_v4().to_string(),
            base_revision: 1,
            title: "audit".into(),
            content_hash: "audit".into(),
            created_at: "2026-10-15".into(),
            markdown_snapshot: "可编辑内容块\n\n".repeat(count),
            document_json: json!({"schemaVersion":1,"type":"doc","content":(0..count).map(|i|json!({"type":"paragraph","attrs":{"blockId":format!("10000000-0000-4000-8000-{i:012}")},"content":[{"type":"text","text":"可编辑内容块"}]})).collect::<Vec<_>>()}),
        };
        let mut current = vec![];
        let mut buffered = vec![];
        for _ in 0..30 {
            let t = Instant::now();
            // Keep the pre-fix implementation explicitly so this remains an A/B
            // probe after RecoveryStore itself has been fixed.
            let mut baseline = tempfile::NamedTempFile::new_in(root.path())?;
            serde_json::to_writer(&mut baseline, &record)?;
            baseline.write_all(b"\n")?;
            baseline.as_file_mut().sync_all()?;
            baseline.persist(recovery.path_for(&record.note_id)?)
                .map_err(|e| e.error)?;
            current.push(t.elapsed().as_secs_f64() * 1000.0);
            let t = Instant::now();
            recovery.put(&record)?;
            buffered.push(t.elapsed().as_secs_f64() * 1000.0);
        }
        println!(
            "blocks={count} serialized_bytes={}",
            serde_json::to_vec(&record)?.len()
        );
        report("baseline-unbuffered-recovery", &mut current);
        report("production-buffered-recovery-same-fsync", &mut buffered);
    }
    Ok(())
}
