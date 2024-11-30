const admin = require("../config/firebase");

const authController = {
	// Sign Up
	signUp: async (req, res) => {
		try {
			const { email, password, displayName } = req.body;

			const userRecord = await admin.auth().createUser({
				email,
				password,
				displayName
			});

			res.status(201).json({
				success: true,
				message: "User created successfully",
				user: {
					uid: userRecord.uid,
					email: userRecord.email,
					displayName: userRecord.displayName
				}
			});
		} catch (error) {
			console.error("SignUp Error:", error);
			res.status(400).json({
				success: false,
				message: error.message
			});
		}
	},

	// Sign In (Verify token and return user data)
	signIn: async (req, res) => {
		try {
			// Token is already verified by middleware
			const { user } = req;

			res.json({
				success: true,
				user: {
					uid: user.uid,
					email: user.email,
					displayName: user.name
				}
			});
		} catch (error) {
			console.error("SignIn Error:", error);
			res.status(400).json({
				success: false,
				message: error.message
			});
		}
	},

	// Check if user is logged in
	isLoggedIn: async (req, res) => {
		try {
			// If middleware passed, user is logged in
			res.json({
				success: true,
				user: {
					uid: req.user.uid,
					email: req.user.email,
					displayName: req.user.name
				}
			});
		} catch (error) {
			res.status(401).json({
				success: false,
				message: "User not authenticated"
			});
		}
	},

	// Sign Out
	signout: async (req, res) => {
		try {
			await admin.auth().revokeRefreshTokens(req.user.uid);

			res.json({
				success: true,
				message: "User signed out successfully"
			});
		} catch (error) {
			console.error("Signout Error:", error);
			res.status(400).json({
				success: false,
				message: error.message
			});
		}
	}
};

module.exports = authController;
