use actix_web::{get, post, HttpResponse, Responder};
use crate::attestation::{get_attestation_report_with_signature};
use crate::verifier::verify_proof;
use crate::types::VerificationResponse;
use crate::dstack_client::DStackClient;

#[get("/health")]
pub async fn health_check() -> impl Responder {
    let client = DStackClient::get_instance();
    let is_reachable = client.is_reachable().await.unwrap_or(false);
    if is_reachable {
        HttpResponse::Ok().body("OK")
    } else {
        HttpResponse::ServiceUnavailable().body("Service not reachable")
    }
}

#[get("/")]
pub async fn root() -> impl Responder {
    let client = DStackClient::get_instance();
    let info = client.info().await.unwrap_or_else(|_| serde_json::Value::String(String::from("Error fetching info")));
    HttpResponse::Ok().body(format!("Welcome to the TLSN Verifier\n\nDStack Info: {}", info))
}

#[post("/verify-proof")]
pub async fn verify_proof_route(body: String) -> impl Responder {
    println!("[verify_proof_route] Starting verification route handler");

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
