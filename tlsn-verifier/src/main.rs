// Declare internal modules
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

/// Main entry point for the TLSN Verifier web server
#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Load environment variables from `.env` and system environment
    config::load_env();

    // Initialize cryptographic key material (preferably from Tappd socket)
    key_manager::init_key_material_from_tappd_socket().await.map_err(|e| {
        std::io::Error::new(
            std::io::ErrorKind::Other,
            "Key material initialization failed",
        )
    })?;

    // Read server binding configuration from env
    let host = config::get_host();
    let port = config::get_port();

    // Print server startup information for debugging/logging
    println!("Running on http://{}:{}", host, port);
    println!("Accepted Server Names: {:?}", config::get_server_names());
    println!(
        "Accepted TLSN Core Version: {}",
        config::get_tlsn_core_version()
    );
    println!("Environment variables loaded successfully.");

    // Launch the HTTP server
    HttpServer::new(|| {
        App::new()
            // Apply API key authorization middleware to all routes
            .wrap(ApiKeyAuth)
            // Register health check route
            .service(health_check)
            // Register proof verification endpoint
            .service(verify_proof_route)
            // Register attestation reporting endpoint
            .service(attestation_route)
    })
    .bind((host.as_str(), port))? // Bind to the configured host and port
    .run()
    .await
}
