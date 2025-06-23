mod config;
mod auth;
mod routes;
mod verifier;
mod types;
use actix_web::{App, HttpServer};
use crate::auth::ApiKeyAuth;
use crate::routes::*;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    config::load_env();

    let host = config::get_host();
    let port = config::get_port();

    println!("Running on http://{}:{}", host, port);

    HttpServer::new(|| {
        App::new()
            .wrap(ApiKeyAuth)
            .service(health_check)
            .service(secure_data)
            .service(verify_proof_route)
    })
    .bind((host.as_str(), port))?
    .run()
    .await
}
