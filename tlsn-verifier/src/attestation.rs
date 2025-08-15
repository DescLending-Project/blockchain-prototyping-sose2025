// Imports the key material and utility types for attestation
use crate::key_manager::{KeyMaterial, try_get_key_material};
use crate::types::{AttestationError, SignedAttestation};
use crate::types::*;
use hyper::{Body, Client, Request};
use hyperlocal::{UnixClientExt, Uri};
use serde_json::json;

/// Encodes a UTF-8 message string into its hexadecimal representation
fn encode_message_hex(
    message: &str,
) -> String {
    return hex::encode(message)
}

/// Signs a hex-encoded message string using the provided `KeyMaterial`
/// and returns the signature as a hex string
fn sign_message(
    key_material: &KeyMaterial,
    message_hex: &str,
) -> String {
    let signature = key_material.sign_message(message_hex.as_bytes());
    let signature_bytes = signature.to_bytes();
    let signature_hex_encoded = hex::encode(signature_bytes);
    return signature_hex_encoded;
}

/// Connects to the TDX quote provider (`tappd`) via Unix socket,
/// sends a custom attestation request with the report_data derived from the key,
/// and returns the parsed attestation quote as a `GetQuoteResponse`
pub async fn read_attestation_report() -> Result<GetQuoteResponse, AttestationError> {
    // Ensure key material has been initialized
    let key_material = try_get_key_material().ok_or_else(|| AttestationError {
        message: "Key material not initialized".to_string(),
    })?;

    // Construct the evidence JSON with SHA-512 hash of the public key
    let custom_evidence = json!({
        "report_data": key_material.report_data_from_key(),  // 64-byte SHA512 hash (hex)
        "hash_algorithm": "raw"  // Request raw hashing algorithm
    });

    // Create Unix domain socket client and target URI for attestation
    let client = Client::unix();
    let uri: hyperlocal::Uri = Uri::new("/var/run/tappd.sock", "/prpc/Tappd.TdxQuote?json").into();

    // Build HTTP POST request with JSON body
    let req = Request::post(uri)
        .header("Content-Type", "application/json")
        .body(Body::from(custom_evidence.to_string()))
        .map_err(|e| {
            AttestationError {
                message: format!("Failed to build request: {}", e),
            }
        })?;

    // Send the request to the tappd socket and await response
    let res = client.request(req).await.map_err(|e| {
        AttestationError {
            message: format!("Failed to send request: {}", e),
        }
    })?;

    // Read the response body bytes
    let body_bytes = hyper::body::to_bytes(res.into_body()).await.map_err(|e| {
        AttestationError {
            message: format!("Failed to read response body: {}", e),
        }
    })?;

    // Parse the body into a `GetQuoteResponse` structure
    let parsed: GetQuoteResponse = serde_json::from_slice(&body_bytes).map_err(|e| {
        AttestationError {
            message: format!("Failed to parse GetQuoteResponse: {}", e),
        }
    })?;
    Ok(parsed)
}

/// Combines the attestation report with a digital signature and verifying key
/// to create a `SignedAttestation` which can be sent for remote verification
pub async fn get_attestation_report_with_signature() -> Result<SignedAttestation, AttestationError> {
    // Ensure key material is available
    let key_material = try_get_key_material().ok_or_else(|| AttestationError {
        message: "Key material not initialized".to_string(),
    })?;

    // Fetch the attestation report from tappd
    let report = read_attestation_report().await?;
    let report_data = report.quote;

    // Convert the report data to hex so it can be signed
    let report_data_hex: String = encode_message_hex(&report_data);

    // Sign the hex-encoded attestation report
    let signature = sign_message(&key_material, &report_data_hex);

    // Get the verifying key in hex format
    let encoded_key = key_material.encode_verify_key();

    // Construct the signed attestation payload
    Ok(SignedAttestation {
        quote: report_data,                                 // Raw quote data (still hex)
        signature_hex_encoded: signature,                   // Signature over quote
        verifying_key_hex_encoded: encoded_key,             // Public key used to sign
        verifying_key_certificate_chain: key_material.certificate_chain.clone(), // Optional certificate chain
    })
}
