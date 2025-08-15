use actix_web::{get, post, HttpResponse, Responder};
use crate::attestation::{get_attestation_report_with_signature};
use crate::verifier::verify_proof;
use crate::types::VerificationResponse;

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
    let verification = verify_proof(&body);

    // Generate an attestation quote with signature and key info
    let attestation = get_attestation_report_with_signature().await;

    // Combine both into a structured response object
    let response = match attestation {
        Ok(report) => {
            VerificationResponse {
                verification,
                attestation: Ok(report),
            }
        }
        Err(e) => {
            VerificationResponse {
                verification,
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
    let attestation = get_attestation_report_with_signature().await;
    match attestation {
        Ok(report) => HttpResponse::Ok().json(report),               // Success
        Err(e) => HttpResponse::InternalServerError().json(e),       // Failure
    }
}
