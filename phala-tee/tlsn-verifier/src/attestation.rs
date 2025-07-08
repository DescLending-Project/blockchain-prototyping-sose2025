use crate::key_manager::{KeyMaterial};
use crate::types::{AttestationError, SignedAttestation};
use dstack_sdk::dstack_client::{GetQuoteResponse};
use hyper::{Body, Client, Request};
use hyperlocal::{UnixClientExt, Uri};
use serde_json::json;
use crate::dstack_client::{self, DStackClient};

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
    let key_material = KeyMaterial::get_instance();
    let dstack_client = DStackClient::get_instance();
    let report_data = key_material.report_data_from_key();

    let quote_result = dstack_client.generate_quote(&report_data).await.map_err(|e| {
        AttestationError {
            message: format!("Failed to generate quote: {:?}", e),
        }
    })?;

    Ok(quote_result)

}

pub async fn get_attestation_report_with_signature() -> Result<SignedAttestation, AttestationError> {
    let key_material = KeyMaterial::get_instance();

    let report = read_attestation_report().await.map_err(|e| AttestationError {
        message: format!("Failed to read attestation report: {:?}", e),
    })?;
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
