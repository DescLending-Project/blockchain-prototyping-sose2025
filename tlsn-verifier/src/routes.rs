use actix_web::{get, post, HttpResponse, Responder};
use crate::attestation::{get_attestation_report_with_signature};
use crate::verifier::verify_proof;
use crate::types::VerificationResponse;

#[get("/health")]
pub async fn health_check() -> impl Responder {
    HttpResponse::Ok().body("OK")
}

#[post("/verify-proof")]
pub async fn verify_proof_route(body: String) -> impl Responder {
    let verification = verify_proof(&body);
    let attestation = get_attestation_report_with_signature().await;

    let response = match attestation {
        Ok(report) => {
            VerificationResponse {
                verification,
                attestation: Ok(report)
            }
        }
        Err(e) => {
            VerificationResponse {
                verification,
                attestation: Err(e)
            }
        }
    };

    // Use references for matching, no need to clone
    match (&response.verification, &response.attestation) {
        (Ok(_), Ok(_)) => HttpResponse::Ok().json(&response),
        (Err(_), Ok(_)) => HttpResponse::BadRequest().json(&response),
        (_, Err(_)) => HttpResponse::InternalServerError().json(&response),
    }
}


#[get("/attestation")]
pub async fn attestation_route() -> impl Responder {
    println!("[attestation] Starting attestation route handler");
    let attestation = get_attestation_report_with_signature().await;
    match attestation {
        Ok(report) => HttpResponse::Ok().json(report),
        Err(e) => HttpResponse::InternalServerError().json(e),
    }
}
