mod attestation;
mod auth;
mod config;
mod key_manager;
mod routes;
mod types;
mod verifier;
use crate::auth::ApiKeyAuth;
use crate::routes::*;
use actix_web::{App, HttpServer};

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    config::load_env();
    key_manager::init_key_material_from_tappd_socket().await.map_err(|e| {
        std::io::Error::new(
            std::io::ErrorKind::Other,
            "Key material initialization failed",
        )
    })?;
    
    let host = config::get_host();
    let port = config::get_port();

    println!("Running on http://{}:{}", host, port);
    println!("Accepted Server Names: {:?}", config::get_server_names());
    println!(
        "Accepted TLSN Core Version: {}",
        config::get_tlsn_core_version()
    );
    println!("Environment variables loaded successfully.");

    HttpServer::new(|| {
        App::new()
            .wrap(ApiKeyAuth)
            .service(health_check)
            .service(verify_proof_route)
            .service(attestation_route)
    })
    .bind((host.as_str(), port))?
    .run()
    .await
}
