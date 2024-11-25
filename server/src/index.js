const express = require("express");
const sharp = require("sharp");
const cors = require("cors");

const app = express();
const port = 3000;

app.use(express.json());
app.use(cors());

app.post("/api/resize", async (req, res) => {
	const { imageUrl, width, height } = req.body;
	console.log("resize request", req.body);

	try {
		console.log("image url", imageUrl);
		// Fetch the image from the provided URL
		const response = await fetch(imageUrl);
		const imageBuffer = Buffer.from(await response.arrayBuffer());
		console.log("image fetched", imageBuffer);

		// Resize the image using Sharp
		const resizedBuffer = await sharp(imageBuffer)
			.resize(width, height, {
				fit: "contain",
				background: { r: 255, g: 255, b: 255, alpha: 0 }
			})
			.toBuffer();
		console.log("image resized", resizedBuffer);

		// Generate a unique filename for the resized image
		const resizedFilename = `resized_${Date.now()}.jpg`;
		console.log("resized filename", resizedFilename);

		// Save the resized image to a folder (e.g., 'public/resized_images/')
		await sharp(resizedBuffer)
			.jpeg()
			.toFile(`public/resized_images/${resizedFilename}`);
		console.log("resized image saved", resizedFilename);

		// Return the URL of the resized image
		res.json({ resizedUrl: `/resized_images/${resizedFilename}` });
	} catch (error) {
		console.error("Error resizing image:", error);
		res.status(500).json({ error: "Failed to resize image" });
	}
});

// an endpoint to fetch images from the public folder
app.use("/resized_images", express.static("public/resized_images"));

app.listen(port, () => {
	console.log(`Server is running on port ${port}`);
});
