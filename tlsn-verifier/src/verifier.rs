use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
use regex::Regex;
use std::time::Instant;
use tlsn_core::CryptoProvider;

use crate::config;
use crate::types::{PresentationJSON, VerificationError, VerificationResult};

/// Verifies a TLSNotary presentation proof from JSON string input
///
/// # Arguments
///
/// * `json` - A string slice containing a TLSNotary presentation in JSON format.
///
/// # Returns
///
/// * `Ok(VerificationResult)` if the proof is valid and passes all checks
/// * `Err(VerificationError)` if any verification step fails
pub fn verify_proof(json: &str) -> Result<VerificationResult, VerificationError> {
    let total_start = Instant::now(); // Track total verification time

    println!("[{}] ⏱ Starting verification...", chrono::Utc::now());

    // Step 1: Parse JSON into PresentationJSON struct
    let start = Instant::now();
    let presentation_json =
        PresentationJSON::from_json_str(json).map_err(|e| VerificationError {
            message: format!("Invalid JSON format: {}", e),
        })?;
    println!("✅ JSON parsed in {:?}", start.elapsed());

    // Step 2: Check for expected TLSNotary core version
    let expected_version = config::get_tlsn_core_version();
    if presentation_json.version != expected_version {
        return Err(VerificationError {
            message: format!(
                "Version mismatch: expected '{}', got '{}'",
                expected_version, presentation_json.version
            ),
        });
    }

    // Step 3: Convert presentation_json -> Presentation object
    let start = Instant::now();
    let presentation = presentation_json
        .to_presentation()
        .map_err(|e| VerificationError {
            message: format!("Invalid presentation encoding: {}", e),
        })?;
    println!("✅ Presentation decoded in {:?}", start.elapsed());

    // Step 4: Ensure verifying key exists
    let verifying_key = presentation.verifying_key().data.clone();
    if verifying_key.is_empty() {
        return Err(VerificationError {
            message: "Verifying key is empty or missing".to_string(),
        });
    }

    // Step 5: Run cryptographic verification of the presentation
    let start = Instant::now();
    let pres_out = presentation
        .verify(&CryptoProvider::default())
        .map_err(|e| VerificationError {
            message: format!("Presentation verification failed: {}", e),
        })?;
    println!("✅ Presentation verified in {:?}", start.elapsed());

    // Step 6: Validate server name against allowed list
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

    // Step 7: Parse timestamp from connection info
    let secs = pres_out.connection_info.time as i64;
    let naive = NaiveDateTime::from_timestamp_opt(secs, 0).ok_or_else(|| VerificationError {
        message: "Invalid or missing timestamp".to_string(),
    })?;
    let dt: DateTime<Utc> = Utc.from_utc_datetime(&naive);

    // Step 8: Extract transcript and get sent/received messages
    let mut transcript = pres_out.transcript.ok_or_else(|| VerificationError {
        message: "Missing transcript in presentation output".to_string(),
    })?;

    transcript.set_unauthed(b'X'); // Mark unauthenticated region
    let sent_bytes = transcript.sent_unsafe().to_vec();
    let recv_bytes = transcript.received_unsafe().to_vec();
    let sent = String::from_utf8_lossy(&sent_bytes);
    let recv = String::from_utf8_lossy(&recv_bytes);

    println!(
        "✅ Transcript parsed, sent/recv size = {}/{}",
        sent_bytes.len(),
        recv_bytes.len()
    );

    // Step 9: Extract and validate Host header
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

    // Step 10: Extract the request path and match against expected credit-score endpoint
    let request_line = sent.lines().next().ok_or_else(|| VerificationError {
        message: "Missing request line in sent transcript".to_string(),
    })?;

    let path_regex = Regex::new(
        r#"GET\s+(?:https?://[^/]+)?(/users/[^/]+/credit-score)\s+HTTP/1\.1"#,
    )
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

    // Step 11: Extract credit score from response JSON
    let score_regex = Regex::new(r#""value"\s*:\s*(\d+)"#).map_err(|e| VerificationError {
        message: format!("Regex compilation failed: {}", e),
    })?;

    /// Extracts the credit score from the received HTML response using a regex pattern.
    /// If the credit score is not found in the response, returns a `VerificationError`.
    ///
    /// # Errors
    ///
    /// Returns a `VerificationError` if the credit score value cannot be found in the response.
    let _credit_score = score_regex
        .captures(&recv)
        .and_then(|cap| cap.get(1))
        .map(|m| m.as_str())
        .ok_or_else(|| VerificationError {
            message: "Credit score value is missing from response".to_string(),
        })?;

    println!("✅ Verification complete in {:?}", total_start.elapsed());

    // Step 12: Return result with useful metadata
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
