# Service Request Management API

## Setup
1. Clone the repository
2. Run `npm install` to install dependencies
3. Create a `.env` file based on `.env.example` and add your MongoDB URI and JWT Secret.
4. Run `npm run dev` to start the server on port 5000.

## API Documentation
* **Auth:** 
  * `POST /api/auth/signup` - Register user
  * `POST /api/auth/login` - Login user
* **Requests (Requires JWT in Bearer Token):**
  * `POST /api/requests` - Create request
  * `GET /api/requests` - Get logged-in user's requests
  * `PUT /api/requests/:id` - Update request
  * `DELETE /api/requests/:id` - Delete request