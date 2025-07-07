use crate::key_manager::{KeyMaterial, try_get_key_material};
use crate::types::{AttestationError, SignedAttestation};
use dstack_sdk::dstack_client::GetQuoteResponse;
use hyper::{Body, Client, Request};
use hyperlocal::{UnixClientExt, Uri};
use serde_json::json;

fn encode_message_hex(
    message: &str,
) -> String {
    return hex::encode(message)
}


fn sign_message(
    key_material: &KeyMaterial,
    message_hex: &str,
) -> String {
    let signature = key_material.sign_message(message_hex.as_bytes());
    let signature_bytes = signature.to_bytes();
    let signature_hex_encoded = hex::encode(signature_bytes);
    return signature_hex_encoded;
}

/// Reads attestation report directly from tappd Unix domain socket
/// and returns it as `GetQuoteResponse`
pub async fn read_attestation_report() -> Result<GetQuoteResponse, AttestationError> {
    let key_material = try_get_key_material().ok_or_else(|| AttestationError {
        message: "Key material not initialized".to_string(),
    })?;
    let custom_evidence = json!({
        "report_data": key_material.report_data_from_key(),
        "hash_algorithm": "raw"
    });
    let client = Client::unix();
    let uri: hyperlocal::Uri = Uri::new("/var/run/tappd.sock", "/prpc/Tappd.TdxQuote?json").into();
    let req = Request::post(uri)
        .header("Content-Type", "application/json")
        .body(Body::from(custom_evidence.to_string()))
        .map_err(|e| {
            AttestationError {
                message: format!("Failed to build request: {}", e),
            }
        })?;

    let res = client.request(req).await.map_err(|e| {
        AttestationError {
            message: format!("Failed to send request: {}", e),
        }
    })?;

    let body_bytes = hyper::body::to_bytes(res.into_body()).await.map_err(|e| {
        AttestationError {
            message: format!("Failed to read response body: {}", e),
        }
    })?;

    let parsed: GetQuoteResponse = serde_json::from_slice(&body_bytes).map_err(|e| {
        AttestationError {
            message: format!("Failed to parse GetQuoteResponse: {}", e),
        }
    })?;
    Ok(parsed)
}


pub async fn get_attestation_report_with_signature() -> Result<SignedAttestation, AttestationError> {
    let key_material = try_get_key_material().ok_or_else(|| AttestationError {
        message: "Key material not initialized".to_string(),
    })?;

    let report = read_attestation_report().await?;
    let report_data = report.quote;
    let report_data_hex: String = encode_message_hex(&report_data);
    
    let signature = sign_message(&key_material, &report_data_hex);
    let encoded_key = key_material.encode_verify_key();
    Ok(SignedAttestation {
        quote: report_data,
        signature_hex_encoded: signature,
        verifying_key_hex_encoded: encoded_key,
    })
}
