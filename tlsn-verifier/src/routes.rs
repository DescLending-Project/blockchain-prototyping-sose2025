use actix_web::{get, post, HttpResponse, Responder};
use crate::verifier::verify_proof;

#[get("/health")]
pub async fn health_check() -> impl Responder {
    HttpResponse::Ok().body("OK")
}

#[post("/verify-proof")]
pub async fn verify_proof_route(body: String) -> impl Responder {
    match verify_proof(&body) {
        Ok(result) => HttpResponse::Ok().json(result),
        Err(err) => HttpResponse::BadRequest().json(err),
    }
}
