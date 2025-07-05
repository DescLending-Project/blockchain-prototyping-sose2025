use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
use regex::Regex;
use std::time::Instant;
use tlsn_core::CryptoProvider;

use crate::config;
use crate::types::{PresentationJSON, VerificationResult, VerificationError};

pub fn verify_proof(json: &str) -> Result<VerificationResult, VerificationError> {
    let total_start = Instant::now();

    println!("[{}] ⏱ Starting verification...", chrono::Utc::now());

    let start = Instant::now();
    let presentation_json = PresentationJSON::from_json_str(json).map_err(|e| VerificationError {
        message: format!("Invalid JSON format: {}", e),
    })?;
    println!("✅ JSON parsed in {:?}", start.elapsed());

    let expected_version = config::get_tlsn_core_version();
    if presentation_json.version != expected_version {
        return Err(VerificationError {
            message: format!(
                "Version mismatch: expected '{}', got '{}'",
                expected_version, presentation_json.version
            ),
        });
    }

    let start = Instant::now();
    let presentation = presentation_json.to_presentation().map_err(|e| VerificationError {
        message: format!("Invalid presentation encoding: {}", e),
    })?;
    println!("✅ Presentation decoded in {:?}", start.elapsed());

    let verifying_key = presentation.verifying_key().data.clone();
    if verifying_key.is_empty() {
        return Err(VerificationError {
            message: "Verifying key is empty or missing".to_string(),
        });
    }

    let start = Instant::now();
    let pres_out = presentation.verify(&CryptoProvider::default()).map_err(|e| VerificationError {
        message: format!("Presentation verification failed: {}", e),
    })?;
    println!("✅ Presentation verified in {:?}", start.elapsed());

    let server_name = pres_out
        .server_name
        .map(|sn| sn.to_string())
        .unwrap_or_else(|| "<no server_name>".to_string());

    let accepted_server_names = config::get_server_names();
    if !accepted_server_names.contains(&server_name) {
        return Err(VerificationError {
            message: format!("Server name '{}' is not in the accepted list", server_name),
        });
    }

    let secs = pres_out.connection_info.time as i64;
    let naive = NaiveDateTime::from_timestamp_opt(secs, 0).ok_or_else(|| VerificationError {
        message: "Invalid or missing timestamp".to_string(),
    })?;
    let dt: DateTime<Utc> = Utc.from_utc_datetime(&naive);

    let mut transcript = pres_out.transcript.ok_or_else(|| VerificationError {
        message: "Missing transcript in presentation output".to_string(),
    })?;

    transcript.set_unauthed(b'X');
    let sent_bytes = transcript.sent_unsafe().to_vec();
    let recv_bytes = transcript.received_unsafe().to_vec();
    let sent = String::from_utf8_lossy(&sent_bytes);
    let recv = String::from_utf8_lossy(&recv_bytes);

    println!("✅ Transcript parsed, sent/recv size = {}/{}", sent_bytes.len(), recv_bytes.len());

    let host_line = sent
        .lines()
        .find(|line| line.to_lowercase().starts_with("host:"))
        .ok_or_else(|| VerificationError {
            message: "Missing 'Host' header in sent transcript".to_string(),
        })?;
    let host = host_line.trim_start_matches("host:").trim();

    if host != server_name {
        return Err(VerificationError {
            message: format!(
                "Host header '{}' does not match server name '{}'",
                host, server_name
            ),
        });
    }

    let request_line = sent.lines().next().ok_or_else(|| VerificationError {
        message: "Missing request line in sent transcript".to_string(),
    })?;

    let path_regex = Regex::new(r#"GET\s+(?:https?://[^/]+)?(/users/[^/]+/credit-score)\s+HTTP/1\.1"#)
        .map_err(|e| VerificationError {
            message: format!("Regex compilation failed: {}", e),
        })?;

    let _path = path_regex
        .captures(request_line)
        .and_then(|cap| cap.get(1))
        .map(|m| m.as_str())
        .ok_or_else(|| VerificationError {
            message: "Request path is missing or invalid".to_string(),
        })?;

    let score_regex = Regex::new(r#""value"\s*:\s*(\d+)"#).map_err(|e| VerificationError {
        message: format!("Regex compilation failed: {}", e),
    })?;

    let _credit_score = score_regex
        .captures(&recv)
        .and_then(|cap| cap.get(1))
        .map(|m| m.as_str())
        .ok_or_else(|| VerificationError {
            message: "Credit score value is missing from response".to_string(),
        })?;

    println!("✅ Verification complete in {:?}", total_start.elapsed());

    Ok(VerificationResult {
        is_valid: true,
        server_name,
        score: _credit_score.to_string(),
        verifying_key: hex::encode(verifying_key),
        sent_hex_encoded: hex::encode(&sent_bytes),
        sent_readable: sent.to_string(),
        recv_hex_encoded: hex::encode(&recv_bytes),
        recv_readable: recv.to_string(),
        time: dt.to_rfc3339(),
    })
}
