import Booking from "../Model/bookingModel.js";
import Car from "../Model/Car.js";
import { createInvoice } from "./invoiceController.js";
import { io } from "../index.js";

export const bookCar = async (req, res) => {
  const {
    carId,
    showroomId,
    rentalStartDate,
    rentalStartTime,
    rentalEndDate,
    rentalEndTime,
  } = req.body;

  const userId = req.user;

  if (
    !carId ||
    !showroomId ||
    !rentalStartDate ||
    !rentalStartTime ||
    !rentalEndDate ||
    !rentalEndTime
  ) {
    return res.status(400).json({ message: "All fields are required." });
  }

  try {
    const car = await Car.findById(carId);
    if (!car) {
      return res.status(404).json({ message: "Car not found." });
    }

    if (car.availability !== "Available") {
      return res
        .status(400)
        .json({ message: "Car is not available for booking." });
    }

    // Checking overlapping bookings for the same car
    const overlappingBooking = await Booking.findOne({
      carId,
      $or: [
        {
          rentalStartDate: { $lte: rentalEndDate },
          rentalEndDate: { $gte: rentalStartDate },
        },
        {
          rentalStartDate: { $gte: rentalStartDate, $lte: rentalEndDate },
        },
        {
          rentalEndDate: { $gte: rentalStartDate, $lte: rentalEndDate },
        },
      ],
    });

    if (overlappingBooking) {
      return res
        .status(400)
        .json({ message: "The car is already booked for the selected dates." });
    }

    // Convert rentalStartDate and rentalEndDate to UTC by appending UTC offset (+05:00)
    const rentalStartDateis = new Date(
      `${rentalStartDate}T${rentalStartTime}:00+05:00`
    );
    const rentalEndDateis = new Date(
      `${rentalEndDate}T${rentalEndTime}:00+05:00`
    );

    const now = new Date();

    // Check that rentalStartDate is not in the past
    if (rentalStartDateis < now) {
      return res.status(400).json({
        message: "Rental start date must be in the present or future.",
      });
    }

    if (rentalEndDateis < rentalStartDateis) {
      return res
        .status(400)
        .json({ message: "End date must be after the start date." });
    }

    // Calculate rental duration and total price
    const rentalDuration =
      (rentalEndDateis - rentalStartDateis) / (1000 * 60 * 60 * 24) + 1;
    const daysRented = Math.max(0, Math.ceil(rentalDuration));
    const totalPrice = daysRented * car.rentRate;

    const formattedRentalStartDate = rentalStartDateis.toISOString().split("T")[0];
    const formattedRentalEndDate = rentalEndDateis.toISOString().split("T")[0];

    // Helper function to format time into 12-hour format
    const formatTimeTo12Hour = (time) => {
      const [hour, minute] = time.split(":").map(Number);
      const period = hour >= 12 ? "PM" : "AM";
      const formattedHour = hour % 12 || 12;
      return `${formattedHour}:${minute.toString().padStart(2, "0")} ${period}`;
    };

    const formattedRentalStartTime = formatTimeTo12Hour(rentalStartTime);
    const formattedRentalEndTime = formatTimeTo12Hour(rentalEndTime);

    // Create a new booking
    const newBooking = new Booking({
      carId,
      userId,
      showroomId,
      rentalStartDate: formattedRentalStartDate,
      rentalStartTime: formattedRentalStartTime,
      rentalEndDate: formattedRentalEndDate,
      rentalEndTime: formattedRentalEndTime,
      totalPrice,
    });

    await newBooking.save();

    // Generate invoice
    const invoicePath = await createInvoice({
      _id: newBooking._id,
      carId,
      userId,
      rentalStartDate: formattedRentalStartDate,
      rentalEndDate: formattedRentalEndDate,
      rentalStartTime: formattedRentalStartTime,
      rentalEndTime: formattedRentalEndTime,
      totalPrice,
    });

    // Update car availability
    car.availability = "Rented Out";
    await car.save();

    const invoiceUrl = `${req.protocol}://${req.get(
      "host"
    )}/api/bookcar/invoices/invoice_${newBooking._id}.pdf`;

    res.status(201).json({
      message: "Car booked successfully",
      booking: newBooking,
      invoiceUrl,
    });
  } catch (error) {
    console.error("Error booking car:", error);
    if (error.name === "ValidationError") {
      return res
        .status(400)
        .json({ message: "Invalid input data.", details: error.errors });
    }
    if (error.code === 11000) {
      return res.status(409).json({ message: "Duplicate booking detected." });
    }
    return res
      .status(500)
      .json({ message: "Server error. Please try again later." });
  }
};

export const getUserBookings = async (req, res) => {
  try {
    const userId = req.user;
    if (!userId) {
      console.log("No user ID found in request");
      return res.status(400).json({ message: "User ID is required" });
    }

    const bookings = await Booking.find({ userId: userId })
      .populate("carId")
      .populate("showroomId", "-password");

    if (!bookings || bookings.length === 0) {
      return res.status(404).json({ message: "No active bookings found" });
    }

    const bookingsWithDetails = bookings.map((booking) => ({
      ...booking.toObject(),
      carDetails: booking.carId,
      showroomDetails: booking.showroomId,
    }));

    res.status(200).json(bookingsWithDetails);
  } catch (error) {
    console.error("Error fetching bookings:", error);

    if (error.name === "MongoError") {
      return res.status(500).json({ message: "Database error occurred" });
    }

    return res.status(500).json({ message: "Server error" });
  }
};

// export const updateBooking = async (req, res) => {
//   const { bookingId } = req.params;
//   const { rentalStartDate, rentalEndDate, rentalStartTime, rentalEndTime } =
//     req.body;

//   try {
//     const booking = await Booking.findById(bookingId).populate("carId");
//     if (!booking) {
//       return res.status(404).json({ message: "Booking not found" });
//     }

//     const currentTime = new Date();
//     console.log("time in update: ", currentTime);

//     const rentalStartDateTime = new Date(
//       `${booking.rentalStartDate}T${booking.rentalStartTime}`
//     );

//     if (rentalStartDateTime <= currentTime) {
//       return res.status(400).json({
//         message:
//           "You can only update the booking before the rental start time.",
//       });
//     }
//     console.log("rentalStartDateTime in update", rentalStartDateTime);

//     if (rentalStartDate) booking.rentalStartDate = rentalStartDate;
//     if (rentalEndDate) booking.rentalEndDate = rentalEndDate;
//     if (rentalStartTime) booking.rentalStartTime = rentalStartTime;
//     if (rentalEndTime) booking.rentalEndTime = rentalEndTime;

//     const updatedRentalStartDateTime = new Date(
//       `${booking.rentalStartDate}T${booking.rentalStartTime}`
//     );
//     const updatedRentalEndDateTime = new Date(
//       `${booking.rentalEndDate}T${booking.rentalEndTime}`
//     );

//     if (updatedRentalEndDateTime <= updatedRentalStartDateTime) {
//       return res.status(400).json({
//         message: "Rental end time must be after the rental start time.",
//       });
//     }

//     console.log("Rental Start (Local):", rentalStartDateTime.toLocaleString());
//     console.log("Current Date and Time (Local):", now.toLocaleString());

//     const overlappingBooking = await Booking.findOne({
//       carId: booking.carId,
//       _id: { $ne: bookingId },
//       $or: [
//         {
//           rentalStartDate: { $lte: booking.rentalEndDate },
//           rentalEndDate: { $gte: booking.rentalStartDate },
//         },
//       ],
//     });
//     if (overlappingBooking) {
//       return res
//         .status(400)
//         .json({ message: "The car is already booked for the selected dates." });
//     }

//     const car = booking.carId;
//     if (!car) {
//       return res.status(404).json({ message: "Car not found" });
//     }

//     const rentalDuration =
//       (updatedRentalEndDateTime - updatedRentalStartDateTime) /
//         (1000 * 60 * 60 * 24) +
//       1;
//     const daysRented = Math.max(0, Math.ceil(rentalDuration));
//     const totalPrice = daysRented * car.rentRate;

//     booking.totalPrice = totalPrice;

//     await booking.save();

//     res.status(200).json({
//       message: "Booking updated successfully",
//       booking,
//     });
//   } catch (error) {
//     console.error("Error updating booking:", error);
//     res.status(500).json({ message: "Error updating booking", error });
//   }
// };

export const updateBooking = async (req, res) => {
  const { bookingId } = req.params;
  const { rentalStartDate, rentalEndDate, rentalStartTime, rentalEndTime } = req.body;

  try {
    const booking = await Booking.findById(bookingId).populate("carId");
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Get the current time in UTC, then adjust to the local time zone (UTC+5 in your case)
    const currentTime = new Date();
    const localCurrentTime = new Date(
      currentTime.toLocaleString("en-US", { timeZone: "Asia/Karachi" })
    );
    console.log("localCurrentTime:", localCurrentTime);
    console.log("currentTime:", currentTime);
    

    // Combine rental start date and time from booking and convert it to local time
    const rentalStartDateTime = new Date(`${booking.rentalStartDate}T${booking.rentalStartTime}`);
    const localRentalStartDateTime = new Date(
      rentalStartDateTime.toLocaleString("en-US", { timeZone: "Asia/Karachi" })
    );
    console.log("localRentalStartDateTime:", localRentalStartDateTime);
    console.log("rentalStartDateTime:", rentalStartDateTime);


    // Restrict updates if the current time is past the rental start time
    if (localCurrentTime >= localRentalStartDateTime) {
      return res.status(400).json({
        message: "You can only update the booking before the rental start time.",
      });
    }

    // Store the previous rental start time for comparison
    const previousRentalStartDateTime = localRentalStartDateTime;

    // If valid, update the booking fields
    if (rentalStartDate) booking.rentalStartDate = rentalStartDate;
    if (rentalEndDate) booking.rentalEndDate = rentalEndDate;
    if (rentalStartTime) booking.rentalStartTime = rentalStartTime;
    if (rentalEndTime) booking.rentalEndTime = rentalEndTime;

    // Calculate the updated rental start and end times, and convert them to local time
    const updatedRentalStartDateTime = new Date(`${booking.rentalStartDate}T${booking.rentalStartTime}`);
    const updatedLocalRentalStartDateTime = new Date(
      updatedRentalStartDateTime.toLocaleString("en-US", { timeZone: "Asia/Karachi" })
    );

    const updatedRentalEndDateTime = new Date(`${booking.rentalEndDate}T${booking.rentalEndTime}`);
    const updatedLocalRentalEndDateTime = new Date(
      updatedRentalEndDateTime.toLocaleString("en-US", { timeZone: "Asia/Karachi" })
    );

    // Validate that the rental end time is after the start time
    if (updatedLocalRentalEndDateTime <= updatedLocalRentalStartDateTime) {
      return res.status(400).json({
        message: "Rental end time must be after the rental start time.",
      });
    }

    // New check: Ensure the new rental start time is after the previous rental start time
    if (updatedLocalRentalStartDateTime <= previousRentalStartDateTime) {
      return res.status(400).json({
        message: "New rental start time must be after the previous rental start time.",
      });
    }

    // Check for overlapping bookings
    const overlappingBooking = await Booking.findOne({
      carId: booking.carId,
      _id: { $ne: bookingId },
      $or: [
        {
          rentalStart: { $lte: updatedLocalRentalEndDateTime },
          rentalEnd: { $gte: updatedLocalRentalStartDateTime },
        },
      ],
    });

    if (overlappingBooking) {
      return res
        .status(400)
        .json({ message: "The car is already booked for the selected dates." });
    }

    // Calculate the rental duration and total price
    const car = booking.carId;
    if (!car) {
      return res.status(404).json({ message: "Car not found" });
    }

    const rentalDuration =
      (updatedLocalRentalEndDateTime - updatedLocalRentalStartDateTime) / (1000 * 60 * 60 * 24) + 1;
    const daysRented = Math.max(0, Math.ceil(rentalDuration));
    const totalPrice = daysRented * car.rentRate;

    booking.totalPrice = totalPrice;

    // Save the updated booking
    await booking.save();

    res.status(200).json({
      message: "Booking updated successfully",
      booking,
    });
  } catch (error) {
    console.error("Error updating booking:", error);
    res.status(500).json({ message: "Error updating booking", error });
  } 
};

export const extendBooking = async (req, res) => {
  const { bookingId } = req.params;
  const { rentalEndDate, rentalEndTime } = req.body;

  try {
    const booking = await Booking.findById(bookingId).populate("carId");
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const currentTime = new Date();
    const rentalStartDateTime = new Date(
      `${booking.rentalStartDate}T${booking.rentalStartTime}`
    );

    if (rentalStartDateTime <= currentTime) {
      return res.status(400).json({
        message:
          "You can only extend the booking before the rental start time.",
      });
    }
    console.log("in extend", rentalStartDateTime);

    if (rentalEndDate) {
      if (isNaN(new Date(rentalEndDate))) {
        return res
          .status(400)
          .json({ message: "Invalid rental end date format." });
      }
      booking.rentalEndDate = rentalEndDate;
    }

    if (rentalEndTime) {
      if (!/^\d{2}:\d{2}$/.test(rentalEndTime)) {
        return res
          .status(400)
          .json({ message: "Invalid rental end time format." });
      }
      booking.rentalEndTime = rentalEndTime;
    }

    const updatedRentalEndDateTime = new Date(
      `${booking.rentalEndDate}T${booking.rentalEndTime}`
    );

    if (updatedRentalEndDateTime <= rentalStartDateTime) {
      return res.status(400).json({
        message: "Rental end time must be after the rental start time.",
      });
    }

    const overlappingBooking = await Booking.findOne({
      carId: booking.carId,
      _id: { $ne: bookingId },
      $or: [
        {
          rentalStartDate: { $lte: booking.rentalEndDate },
          rentalEndDate: { $gte: booking.rentalStartDate },
        },
      ],
    });
    if (overlappingBooking) {
      return res
        .status(400)
        .json({ message: "The car is already booked for the selected dates." });
    }

    const rentalDuration =
      (updatedRentalEndDateTime - rentalStartDateTime) / (1000 * 60 * 60 * 24) +
      1;
    const daysRented = Math.max(0, Math.ceil(rentalDuration));
    const totalPrice = daysRented * booking.carId.rentRate;

    if (isNaN(totalPrice) || totalPrice <= 0) {
      return res
        .status(400)
        .json({ message: "Failed to calculate total price." });
    }

    booking.totalPrice = totalPrice;

    await booking.save();

    const invoicePath = await createInvoice({
      _id: booking._id,
      carId: booking.carId,
      userId: booking.userId,
      rentalStartDate: booking.rentalStartDate,
      rentalEndDate: booking.rentalEndDate,
      rentalStartTime: booking.rentalStartTime,
      rentalEndTime: booking.rentalEndTime,
      totalPrice,
    });

    const invoiceUrl = `${req.protocol}://${req.get(
      "host"
    )}/api/bookcar/invoices/invoice_${booking._id}.pdf`;

    res.status(200).json({
      message: "Booking extended successfully",
      booking,
      invoiceUrl,
    });
  } catch (error) {
    console.error("Error extending booking:", error);
    res.status(500).json({ message: "Error extending booking", error });
  }
};

export const cancelBooking = async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user;

  try {
    const booking = await Booking.findOne({ _id: bookingId, userId });
    if (!booking) {
      return res
        .status(404)
        .json({ message: "Booking not found or unauthorized access." });
    }

    const car = await Car.findById(booking.carId);
    if (car) {
      car.availability = "Available";
      await car.save();
    }

    await Booking.findByIdAndDelete(bookingId);

    return res.status(200).json({ message: "Booking canceled successfully." });
  } catch (error) {
    console.error("Error canceling booking:", error);
    return res
      .status(500)
      .json({ message: "Server error. Please try again later." });
  }
};

export const Return_car = async (req, res) => {
  try {
    const { BookingId } = req.params;
    const booking = await Booking.findById(BookingId).populate("carId");
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    console.log("booking details", booking);
    const car = await Car.findById(booking.carId._id);
    if (!car) {
      return res.status(404).json({ message: "car not found" });
    }
    io.emit(`notification${car.userId}`, {
      message: "Car return request recieved",
    });
    return res
      .status(200)
      .json({ message: "Return request sent to showroom  owner for approved" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Something went wrong", error });
  }
};
