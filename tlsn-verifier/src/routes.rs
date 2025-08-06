use actix_web::{get, post, HttpResponse, Responder};
use serde_json;
use crate::attestation::{get_attestation_report_with_signature};
use crate::verifier::verify_proof;
use crate::types::VerificationResponse;
use sha2::{Digest, Sha512};
/// Health check endpoint for readiness/liveness probes
#[get("/health")]
pub async fn health_check() -> impl Responder {
    HttpResponse::Ok().body("OK") // Always returns 200 OK with simple body
}

/// Main verification endpoint that handles TLSN proof verification + attestation
#[post("/verify-proof")]
pub async fn verify_proof_route(body: String) -> impl Responder {
    println!("[verify_proof_route] Starting verification route handler");

    // Verify the TLSN presentation from the client body
    let verification_result = verify_proof(&body);
    let verification_str = serde_json::to_string(&verification_result).unwrap_or_else(|_| "Failed to serialize verification result".to_string());
    println!("[verify_proof_route] Verification result: {}", verification_str);
    let verification_str_hex = hex::encode(verification_str.as_bytes());
    // Generate an attestation quote with signature and key info
    let attestation = get_attestation_report_with_signature(&verification_str_hex).await;
    println!("[verify_proof_route] Attestation report generated successfully");
    // Combine both into a structured response object
    let response = match attestation {
        Ok(report) => {
            VerificationResponse {
                verification: verification_result,
                attestation: Ok(report),
            }
        }
        Err(e) => {
            VerificationResponse {
                verification: verification_result,
                attestation: Err(e),
            }
        }
    };

    // Determine HTTP response code based on success/failure cases
    match (&response.verification, &response.attestation) {
        (Ok(_), Ok(_)) => HttpResponse::Ok().json(&response),                     // All good
        (Err(_), Ok(_)) => HttpResponse::BadRequest().json(&response),           // Proof invalid
        (_, Err(_)) => HttpResponse::InternalServerError().json(&response),      // Attestation failure
    }
}

/// Standalone attestation endpoint that returns only the attestation data
#[get("/attestation")]
pub async fn attestation_route() -> impl Responder {
    println!("[attestation] Starting attestation route handler");

    // Generate and return attestation report with signature
    let attestation = get_attestation_report_with_signature("").await;
    match attestation {
        Ok(report) => HttpResponse::Ok().json(report),               // Success
        Err(e) => HttpResponse::InternalServerError().json(e),       // Failure
    }
}
