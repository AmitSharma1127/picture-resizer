const router = require("express").Router();
const { body } = require("express-validator");
const { validate } = require("../middleware/validate");
const { verifyToken } = require("../middleware/auth");
const authController = require("../controllers/auth.controller");

// Validation rules
const signUpValidation = [
	body("email").isEmail().normalizeEmail(),
	body("password").isLength({ min: 6 }),
	body("displayName").trim().notEmpty()
];

// Routes
router.post("/signup", validate(signUpValidation), authController.signUp);
router.post("/signin", verifyToken, authController.signIn);
router.get("/is-logged-in", verifyToken, authController.isLoggedIn);
router.post("/signout", verifyToken, authController.signout);

module.exports = router;
