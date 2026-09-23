import { readJson } from "./config.ts";
import { STRAVA_EXERCISE_TYPES } from "./stravaExerciseTypes.ts";

type Equipment =
  | "barbell"
  | "cable"
  | "dumbbell"
  | "smith"
  | "band"
  | "kettlebell"
  | "bodyweight"
  | "leverageMachine"
  | "medicineball"
  | "ezbar"
  | "trapbar";

type BuiltIn = [defaultEquipment: Equipment | undefined, types: Partial<Record<Equipment, string>>];

// Liftosaur's built-in exercises (src/models/exercise.ts in github.com/astashov/liftosaur) by display name:
// [default equipment, Strava exercise type per equipment]. Liftosaur only appends ", <Equipment>" to the
// name when it differs from the default. Strava's catalog is narrower than Liftosaur's, so some variants
// use the closest movement or the category's *_GENERIC type.
const BUILT_IN: Record<string, BuiltIn> = {
  "Ab Wheel": ["bodyweight", { bodyweight: "AB_WHEEL_ROLLOUT" }],
  "Arnold Press": ["dumbbell", { dumbbell: "ARNOLD_PRESS", kettlebell: "ARNOLD_PRESS" }],
  "Around The World": ["dumbbell", { dumbbell: "FLYE_GENERIC" }],
  "Back Extension": ["leverageMachine", { bodyweight: "BACK_EXTENSION", leverageMachine: "MACHINE_BACK_EXTENSION" }],
  "Ball Slams": ["medicineball", { medicineball: "MEDICINE_BALL_SLAM" }],
  "Battle Ropes": ["bodyweight", { bodyweight: "BATTLE_ROPES" }],
  "Behind The Neck Press": ["barbell", { barbell: "BARBELL_BEHIND_THE_HEAD_SHOULDER_PRESS" }],
  "Bench Dip": ["bodyweight", { bodyweight: "BENCH_DIP" }],
  "Bench Press": [
    "barbell",
    {
      barbell: "BARBELL_BENCH_PRESS",
      cable: "BENCH_PRESS_GENERIC",
      dumbbell: "DUMBBELL_BENCH_PRESS",
      smith: "BENCH_PRESS_GENERIC",
      band: "BENCH_PRESS_GENERIC",
      kettlebell: "BENCH_PRESS_GENERIC",
    },
  ],
  "Bench Press Close Grip": [
    "barbell",
    {
      barbell: "CLOSE_GRIP_BARBELL_BENCH_PRESS",
      ezbar: "CLOSE_GRIP_BARBELL_BENCH_PRESS",
      smith: "CLOSE_GRIP_BARBELL_BENCH_PRESS",
    },
  ],
  "Bench Press Wide Grip": [
    "barbell",
    { barbell: "WIDE_GRIP_BARBELL_BENCH_PRESS", smith: "WIDE_GRIP_BARBELL_BENCH_PRESS" },
  ],
  "Bent Over One Arm Row": ["dumbbell", { dumbbell: "DUMBBELL_ROW" }],
  "Bent Over Row": [
    "barbell",
    {
      barbell: "BENT_OVER_BARBELL_ROW",
      cable: "BENT_OVER_ROW",
      dumbbell: "BENT_OVER_DUMBBELL_ROW",
      band: "BENT_OVER_ROW",
      leverageMachine: "BENT_OVER_ROW",
      smith: "SMITH_MACHINE_ROW",
    },
  ],
  "Bicep Curl": [
    "dumbbell",
    {
      barbell: "BARBELL_BICEPS_CURL",
      dumbbell: "STANDING_DUMBBELL_BICEPS_CURL",
      band: "CURL_GENERIC",
      leverageMachine: "MACHINE_BICEP_CURL",
      cable: "CABLE_BICEPS_CURL",
      ezbar: "STANDING_EZ_BAR_BICEPS_CURL",
      kettlebell: "KETTLEBELL_BICEPS_CURL",
    },
  ],
  "Bicycle Crunch": ["bodyweight", { bodyweight: "BICYCLE_CRUNCH" }],
  "Box Jump": ["bodyweight", { bodyweight: "BOX_JUMP" }],
  "Box Squat": ["barbell", { barbell: "BARBELL_BOX_SQUAT", dumbbell: "DUMBBELL_SQUAT" }],
  "Bulgarian Split Squat": [
    "dumbbell",
    { dumbbell: "DUMBBELL_BULGARIAN_SPLIT_SQUATS", barbell: "BARBELL_BULGARIAN_SPLIT_SQUAT" },
  ],
  Burpee: ["bodyweight", { bodyweight: "BURPEE" }],
  "Cable Crossover": ["cable", { cable: "CABLE_CROSSOVER" }],
  "Cable Crunch": ["cable", { cable: "CABLE_CRUNCH" }],
  // Liftosaur's is a triceps kickback; Strava's CABLE_KICKBACK is the glute one.
  "Cable Kickback": ["cable", { cable: "TRICEPS_EXTENSION_GENERIC" }],
  "Cable Pull Through": ["cable", { cable: "CABLE_RDL" }],
  "Cable Twist": [
    "cable",
    {
      barbell: "CHOP_GENERIC",
      bodyweight: "CHOP_GENERIC",
      cable: "CABLE_WOODCHOP",
      leverageMachine: "CHOP_GENERIC",
      band: "CHOP_GENERIC",
    },
  ],
  "Calf Press on Leg Press": ["leverageMachine", { leverageMachine: "MACHINE_CALF_PRESS" }],
  "Calf Press on Seated Leg Press": ["leverageMachine", { leverageMachine: "MACHINE_CALF_PRESS" }],
  "Chest Dip": ["bodyweight", { bodyweight: "CHEST_DIP" }],
  "Chest Fly": [
    "dumbbell",
    {
      barbell: "FLYE_GENERIC",
      cable: "CABLE_CROSSOVER",
      dumbbell: "DUMBBELL_FLYE",
      leverageMachine: "MACHINE_CHEST_FLY",
      band: "BAND_CHEST_FLY",
    },
  ],
  "Chest Press": ["dumbbell", { dumbbell: "CHEST_PRESS", leverageMachine: "MACHINE_CHEST_PRESS", band: "CHEST_PRESS" }],
  "Chest-Supported Row": [
    "barbell",
    { barbell: "CHEST_SUPPORTED_ROW", dumbbell: "CHEST_SUPPORTED_ROW", leverageMachine: "MACHINE_CHEST_SUPPORTED_ROW" },
  ],
  "Chin Up": ["bodyweight", { leverageMachine: "ASSISTED_CHIN_UP", bodyweight: "CLOSE_GRIP_CHIN_UP", band: "ASSISTED_CHIN_UP" }],
  Clean: ["barbell", { barbell: "CLEAN", dumbbell: "DUMBBELL_CLEAN", kettlebell: "KETTLEBELL_CLEAN" }],
  "Clean and Jerk": ["barbell", { barbell: "CLEAN_AND_JERK" }],
  "Concentration Curl": [
    "dumbbell",
    {
      barbell: "CONCENTRATION_CURL",
      dumbbell: "CONCENTRATION_CURL",
      band: "CONCENTRATION_CURL",
      cable: "CONCENTRATION_CURL",
    },
  ],
  "Cross Body Crunch": ["bodyweight", { bodyweight: "OBLIQUE_CRUNCH" }],
  Crunch: ["bodyweight", { cable: "CABLE_CRUNCH", bodyweight: "CRUNCH", leverageMachine: "AB_CRUNCH_MACHINE" }],
  Cycling: ["bodyweight", { bodyweight: "CARDIO_GENERIC" }],
  Deadlift: [
    "barbell",
    {
      barbell: "BARBELL_DEADLIFT",
      cable: "DEADLIFT_GENERIC",
      dumbbell: "DUMBBELL_DEADLIFT",
      leverageMachine: "DEADLIFT_GENERIC",
      smith: "DEADLIFT_GENERIC",
      band: "DEADLIFT_GENERIC",
      kettlebell: "KETTLEBELL_DEADLIFT",
      bodyweight: "DEADLIFT_GENERIC",
      trapbar: "TRAP_BAR_DEADLIFT",
    },
  ],
  "Deadlift High Pull": ["barbell", { barbell: "BARBELL_HIGH_PULL" }],
  "Decline Bench Press": [
    "barbell",
    {
      barbell: "BENCH_PRESS_GENERIC",
      dumbbell: "DECLINE_DUMBBELL_BENCH_PRESS",
      smith: "BENCH_PRESS_GENERIC",
      leverageMachine: "MACHINE_DECLINE_BENCH_PRESS",
    },
  ],
  "Decline Crunch": ["bodyweight", { bodyweight: "DECLINE_CRUNCH" }],
  "Deficit Deadlift": ["barbell", { barbell: "BARBELL_DEADLIFT", trapbar: "TRAP_BAR_DEADLIFT" }],
  "Elliptical Machine": ["leverageMachine", { leverageMachine: "CARDIO_GENERIC" }],
  "Face Pull": ["band", { band: "FACE_PULL", cable: "FACE_PULL" }],
  "Flat Knee Raise": ["bodyweight", { bodyweight: "LYING_KNEE_RAISE" }],
  "Flat Leg Raise": ["bodyweight", { bodyweight: "LYING_STRAIGHT_LEG_RAISE" }],
  "Front Raise": [
    "dumbbell",
    {
      barbell: "FRONT_RAISE",
      cable: "FRONT_RAISE",
      dumbbell: "FRONT_RAISE",
      bodyweight: "FRONT_RAISE",
      band: "FRONT_RAISE",
    },
  ],
  "Front Squat": [
    "barbell",
    {
      barbell: "BARBELL_FRONT_SQUAT",
      kettlebell: "KB_FRONT_RACKED_SQUAT",
      dumbbell: "DUMBBELL_SQUAT",
      cable: "SQUAT_GENERIC",
      smith: "SMITH_MACHINE_SQUAT",
    },
  ],
  "Goblet Squat": ["dumbbell", { kettlebell: "GOBLET_SQUAT", dumbbell: "DUMBBELL_GOBLET_SQUATS" }],
  "Good Morning": [
    "barbell",
    { barbell: "BARBELL_GOOD_MORNING", smith: "GOOD_MORNING", leverageMachine: "GOOD_MORNING", cable: "CABLE_GOOD_MORNING" },
  ],
  "Glute Bridge": ["dumbbell", { band: "GLUTE_BRIDGE", barbell: "GLUTE_BRIDGE", dumbbell: "GLUTE_BRIDGE" }],
  "Glute Bridge March": ["bodyweight", { bodyweight: "GLUTE_BRIDGE" }],
  "Glute Kickback": [
    "cable",
    {
      leverageMachine: "MACHINE_GLUTE_KICKBACK",
      bodyweight: "GLUTE_KICKBACK_ON_FLOOR",
      cable: "CABLE_KICKBACK",
      band: "GLUTE_KICKBACK_ON_FLOOR",
    },
  ],
  "Hack Squat": [
    "barbell",
    { barbell: "MACHINE_HACK_SQUAT", smith: "MACHINE_HACK_SQUAT", leverageMachine: "MACHINE_HACK_SQUAT" },
  ],
  "Hammer Curl": ["dumbbell", { cable: "CABLE_HAMMER_CURL", dumbbell: "DUMBBELL_HAMMER_CURL", band: "CURL_GENERIC" }],
  "Handstand Push Up": ["bodyweight", { bodyweight: "HANDSTAND_PUSH_UP" }],
  "Hang Clean": ["barbell", { barbell: "BARBELL_HANG_SQUAT_CLEAN", kettlebell: "KETTLEBELL_CLEAN" }],
  "Hang Snatch": ["barbell", { barbell: "BARBELL_HANG_SQUAT_SNATCH" }],
  "Hanging Leg Raise": ["bodyweight", { bodyweight: "HANGING_LEG_RAISE", cable: "HANGING_LEG_RAISE" }],
  "High Knee Skips": ["bodyweight", { bodyweight: "HIGH_KNEES" }],
  "High Row": ["leverageMachine", { leverageMachine: "MACHINE_ISOLATERAL_HIGH_ROW" }],
  "Hip Abductor": [
    "leverageMachine",
    {
      leverageMachine: "MACHINE_HIP_ABDUCTION",
      bodyweight: "STANDING_HIP_ABDUCTION",
      cable: "CABLE_HIP_ABDUCTION",
      band: "STANDING_HIP_ABDUCTION",
    },
  ],
  "Hip Adductor": [
    "leverageMachine",
    {
      leverageMachine: "MACHINE_HIP_ADDUCTION",
      cable: "STANDING_ADDUCTION",
      band: "STANDING_ADDUCTION",
      bodyweight: "STANDING_ADDUCTION",
    },
  ],
  "Hip Thrust": [
    "barbell",
    {
      barbell: "BARBELL_HIP_THRUST",
      leverageMachine: "MACHINE_HIP_THRUST",
      band: "HIP_THRUST",
      bodyweight: "HIP_THRUST",
      dumbbell: "DUMBBELL_HIP_THRUST",
      smith: "HIP_THRUST",
    },
  ],
  "Incline Bench Press": [
    "barbell",
    {
      barbell: "INCLINE_BARBELL_BENCH_PRESS",
      cable: "BENCH_PRESS_GENERIC",
      dumbbell: "INCLINE_DUMBBELL_BENCH_PRESS",
      smith: "SMITH_MACHINE_INCLINE_BENCH_PRESS",
    },
  ],
  "Incline Bench Press Wide Grip": ["barbell", { barbell: "INCLINE_BARBELL_BENCH_PRESS" }],
  "Incline Chest Fly": ["dumbbell", { cable: "INCLINE_CABLE_FLY", dumbbell: "INCLINE_DUMBBELL_FLYE" }],
  "Incline Chest Press": [
    "dumbbell",
    { leverageMachine: "MACHINE_INCLINE_CHEST_PRESS", band: "CHEST_PRESS", dumbbell: "INCLINE_DUMBBELL_BENCH_PRESS" },
  ],
  "Incline Curl": ["dumbbell", { dumbbell: "INCLINE_DUMBBELL_BICEPS_CURL" }],
  "Incline Row": ["dumbbell", { barbell: "CHEST_SUPPORTED_ROW", dumbbell: "CHEST_SUPPORTED_ROW" }],
  "Inverted Row": ["bodyweight", { bodyweight: "INVERTED_ROW" }],
  "Iso-Lateral Chest Press": [
    "dumbbell",
    { dumbbell: "MACHINE_ISOLATERAL_CHEST_PRESS", leverageMachine: "MACHINE_ISOLATERAL_CHEST_PRESS" },
  ],
  "Iso-Lateral Row": ["dumbbell", { dumbbell: "MACHINE_SEATED_ROW", leverageMachine: "MACHINE_SEATED_ROW" }],
  "Jackknife Sit Up": ["bodyweight", { bodyweight: "V_UP" }],
  "Jump Rope": ["bodyweight", { bodyweight: "JUMP_ROPE" }],
  "Jump Squat": ["barbell", { barbell: "PLYO_GENERIC", bodyweight: "BODY_WEIGHT_JUMP_SQUAT" }],
  "Jumping Jack": [undefined, { bodyweight: "JUMPING_JACKS" }],
  "Kettlebell Swing": ["kettlebell", { dumbbell: "HIP_SWING_GENERIC", kettlebell: "KETTLEBELL_SWING" }],
  "Kettlebell Turkish Get Up": ["kettlebell", { kettlebell: "TURKISH_GET_UP" }],
  "Kipping Pull Up": ["bodyweight", { bodyweight: "PULL_UP_GENERIC" }],
  "Knee Raise": ["bodyweight", { bodyweight: "LEG_RAISE_PARALLEL_BARS" }],
  "Kneeling Pulldown": ["band", { band: "LAT_PULLDOWN", cable: "LAT_PULLDOWN" }],
  "Knees to Elbows": ["bodyweight", { bodyweight: "HANGING_KNEE_RAISE" }],
  "Lat Pulldown": ["cable", { cable: "LAT_PULLDOWN", leverageMachine: "LAT_PULLDOWN", band: "LAT_PULLDOWN" }],
  "Lateral Box Jump": [undefined, { bodyweight: "LATERAL_BOX_JUMP" }],
  "Lateral Raise": [
    "dumbbell",
    {
      cable: "CABLE_LATERAL_RAISE",
      dumbbell: "LATERAL_RAISE_GENERIC",
      leverageMachine: "LATERAL_RAISE_GENERIC",
      band: "LATERAL_RAISE_GENERIC",
      kettlebell: "LATERAL_RAISE_GENERIC",
    },
  ],
  "Legs Up Bench Press": ["barbell", { barbell: "BARBELL_FEET_UP_BENCH_PRESS" }],
  "Leg Curl": ["leverageMachine", { leverageMachine: "LEG_CURL_GENERIC" }],
  "Leg Extension": ["leverageMachine", { leverageMachine: "MACHINE_LEG_EXTENSION", band: "BANDED_QUAD_EXTENSION" }],
  "Leg Press": ["leverageMachine", { smith: "LEG_PRESS", leverageMachine: "MACHINE_LEG_PRESS" }],
  Lunge: [
    "barbell",
    {
      barbell: "BARBELL_LUNGE",
      dumbbell: "LUNGE_GENERIC",
      bodyweight: "LUNGE_GENERIC",
      cable: "LUNGE_GENERIC",
      kettlebell: "KETTLEBELL_LUNGE",
      smith: "SMITH_MACHINE_LUNGE",
    },
  ],
  "Lying Bicep Curl": [
    "dumbbell",
    {
      barbell: "CURL_GENERIC",
      dumbbell: "CURL_GENERIC",
      band: "CURL_GENERIC",
      leverageMachine: "MACHINE_BICEP_CURL",
      cable: "CABLE_BICEPS_CURL",
      ezbar: "CURL_GENERIC",
    },
  ],
  "Lying Leg Curl": ["leverageMachine", { leverageMachine: "LEG_CURL_GENERIC", band: "BANDED_HAMSTRING_CURL" }],
  "Mountain Climber": ["bodyweight", { bodyweight: "MOUNTAIN_CLIMBER" }],
  "Muscle Up": ["bodyweight", { bodyweight: "MUSCLE_UP" }],
  "Oblique Crunch": ["bodyweight", { bodyweight: "OBLIQUE_CRUNCH" }],
  "Overhead Press": [
    "barbell",
    {
      barbell: "OVERHEAD_BARBELL_PRESS",
      dumbbell: "OVERHEAD_DUMBBELL_PRESS",
      ezbar: "OVERHEAD_BARBELL_PRESS",
      smith: "SMITH_MACHINE_OVERHEAD_PRESS",
      kettlebell: "SHOULDER_PRESS_GENERIC",
    },
  ],
  "Overhead Squat": ["barbell", { barbell: "OVERHEAD_SQUAT", dumbbell: "OVERHEAD_SQUAT" }],
  "Pec Deck": ["leverageMachine", { leverageMachine: "PEC_DECK_BUTTERFLY" }],
  "Pendlay Row": ["barbell", { barbell: "BENT_OVER_BARBELL_ROW" }],
  "Pistol Squat": [
    "bodyweight",
    { kettlebell: "PISTOL_SQUAT", leverageMachine: "ASSISTED_PISTOL_SQUATS", bodyweight: "PISTOL_SQUAT" },
  ],
  Plank: ["bodyweight", { bodyweight: "PLANK_GENERIC" }],
  "Power Clean": ["barbell", { barbell: "BARBELL_POWER_CLEAN" }],
  "Power Snatch": ["barbell", { barbell: "BARBELL_POWER_SNATCH" }],
  "Preacher Curl": [
    "dumbbell",
    {
      barbell: "EZ_BAR_PREACHER_CURL",
      dumbbell: "CURL_GENERIC",
      ezbar: "EZ_BAR_PREACHER_CURL",
      leverageMachine: "PREACHER_CURL_MACHINE",
    },
  ],
  "Press Under": ["barbell", { barbell: "SNATCH_BALANCE" }],
  "Pull Up": [
    "bodyweight",
    { leverageMachine: "MACHINE_ASSISTED_PULL_UP", bodyweight: "PULL_UP_GENERIC", band: "PULL_UP_GENERIC" },
  ],
  Pullover: [
    "dumbbell",
    {
      barbell: "DUMBBELL_PULLOVER",
      dumbbell: "DUMBBELL_PULLOVER",
      leverageMachine: "MACHINE_PULLOVER",
      cable: "STRAIGHT_ARM_PULLDOWN",
    },
  ],
  "Push Press": [
    "kettlebell",
    { bodyweight: "PUSH_PRESS", kettlebell: "PUSH_PRESS", barbell: "BARBELL_PUSH_PRESS", dumbbell: "DUMBBELL_PUSH_PRESS" },
  ],
  "Push Up": ["bodyweight", { bodyweight: "PUSH_UP_GENERIC", band: "PUSH_UP_GENERIC" }],
  "Reverse Crunch": ["bodyweight", { bodyweight: "REVERSE_CRUNCH", cable: "REVERSE_CRUNCH" }],
  "Reverse Curl": [
    "dumbbell",
    {
      barbell: "BARBELL_REVERSE_CURL",
      cable: "REVERSE_CABLE_CURLS",
      dumbbell: "CURL_GENERIC",
      band: "CURL_GENERIC",
      ezbar: "BARBELL_REVERSE_CURL",
    },
  ],
  "Reverse Fly": [
    "dumbbell",
    {
      dumbbell: "DUMBBELL_REAR_DELT_FLY",
      leverageMachine: "MACHINE_REAR_DELT_REVERSE_FLY",
      band: "BAND_PULLAPARTS",
      cable: "CABLE_REAR_DELT_REVERSE_FLY",
    },
  ],
  "Reverse Grip Concentration Curl": ["dumbbell", { dumbbell: "CONCENTRATION_CURL" }],
  "Reverse Plank": ["bodyweight", { bodyweight: "REVERSE_PLANK" }],
  "Reverse Lat Pulldown": ["cable", { cable: "UNDERHAND_LAT_PULLDOWN" }],
  "Reverse Lunge": [
    "dumbbell",
    {
      barbell: "BARBELL_REVERSE_LUNGE",
      dumbbell: "DUMBBELL_REVERSE_LUNGE",
      bodyweight: "REVERSE_LUNGE",
      cable: "REVERSE_LUNGE",
    },
  ],
  "Reverse Wrist Curl": ["barbell", { barbell: "BARBELL_REVERSE_WRIST_CURL", dumbbell: "DUMBBELL_REVERSE_WRIST_CURL" }],
  "Romanian Deadlift": [
    "dumbbell",
    {
      barbell: "BARBELL_ROMANIAN_DEADLIFT",
      dumbbell: "DUMBBELL_ROMANIAN_DEADLIFTS",
      cable: "CABLE_RDL",
      kettlebell: "ROMANIAN_DEADLIFTS",
      smith: "ROMANIAN_DEADLIFTS",
      trapbar: "ROMANIAN_DEADLIFTS",
    },
  ],
  "Reverse Hyperextension": ["band", { band: "REVERSE_HYPER", leverageMachine: "REVERSE_HYPER" }],
  Rowing: ["bodyweight", { bodyweight: "ROWING_MACHINE", cable: "ROWING_MACHINE" }],
  "Russian Twist": [
    "bodyweight",
    { bodyweight: "RUSSIAN_TWIST", dumbbell: "DUMBBELL_RUSSIAN_TWIST", cable: "RUSSIAN_TWIST" },
  ],
  "Safety Squat Bar Squat": ["barbell", { barbell: "BARBELL_SQUAT" }],
  "Seated Calf Raise": [
    "barbell",
    { barbell: "SEATED_CALF_RAISE", dumbbell: "SEATED_DUMBBELL_CALF_RAISE", leverageMachine: "SEATED_CALF_RAISE" },
  ],
  "Seated Front Raise": ["dumbbell", { barbell: "FRONT_RAISE", dumbbell: "FRONT_RAISE" }],
  "Seated Leg Curl": ["leverageMachine", { leverageMachine: "MACHINE_LEG_CURL_SEATED" }],
  "Seated Leg Press": ["leverageMachine", { leverageMachine: "MACHINE_LEG_PRESS" }],
  "Seated Overhead Press": [
    "barbell",
    { barbell: "SEATED_BARBELL_PRESS", dumbbell: "SEATED_DUMBBELL_SHOULDER_PRESS" },
  ],
  "Seated Palms Up Wrist Curl": ["dumbbell", { dumbbell: "SEATED_PALMS_UP_WRIST_CURL" }],
  "Seated Row": ["cable", { cable: "SEATED_CABLE_ROW", band: "ROW_GENERIC", leverageMachine: "MACHINE_SEATED_ROW" }],
  "Seated Wide Grip Row": ["cable", { cable: "SEATED_CABLE_ROW" }],
  "Shoulder Press": [
    "dumbbell",
    {
      cable: "SHOULDER_PRESS_GENERIC",
      dumbbell: "SEATED_DUMBBELL_SHOULDER_PRESS",
      leverageMachine: "MACHINE_SEATED_SHOULDER_PRESS",
      band: "SHOULDER_PRESS_GENERIC",
      smith: "SMITH_MACHINE_OVERHEAD_PRESS",
      barbell: "OVERHEAD_BARBELL_PRESS",
      kettlebell: "SHOULDER_PRESS_GENERIC",
    },
  ],
  "Shoulder Press Parallel Grip": ["dumbbell", { dumbbell: "SEATED_DUMBBELL_SHOULDER_PRESS" }],
  Shrug: [
    "dumbbell",
    {
      barbell: "BARBELL_SHRUG",
      cable: "SHRUG_GENERIC",
      dumbbell: "DUMBBELL_SHRUG",
      leverageMachine: "SHRUG_GENERIC",
      band: "SHRUG_GENERIC",
      smith: "SHRUG_GENERIC",
      trapbar: "SHRUG_GENERIC",
    },
  ],
  "Side Bend": ["dumbbell", { cable: "CABLE_SIDE_BEND", dumbbell: "DUMBBELL_SIDE_BEND", band: "SIDE_BEND" }],
  "Side Crunch": ["bodyweight", { bodyweight: "OBLIQUE_CRUNCH", band: "OBLIQUE_CRUNCH", cable: "OBLIQUE_CRUNCH" }],
  "Side Hip Abductor": [
    "bodyweight",
    { bodyweight: "SIDE_LYING_LEG_RAISE", barbell: "HIP_STABILITY_GENERIC", leverageMachine: "MACHINE_HIP_ABDUCTION" },
  ],
  "Side Lying Clam": ["bodyweight", { bodyweight: "CLAMS" }],
  "Side Plank": ["bodyweight", { bodyweight: "SIDE_PLANK" }],
  "Single Leg Bridge": ["bodyweight", { bodyweight: "SINGLE_LEG_GLUTE_BRIDGE" }],
  "Single Leg Calf Raise": [
    "barbell",
    {
      barbell: "SINGLE_LEG_BARBELL_CALF_RAISE",
      dumbbell: "SINGLE_LEG_DUMBBELL_STANDING_CALF_RAISE",
      leverageMachine: "SINGLE_LEG_STANDING_CALF_RAISE",
      bodyweight: "SINGLE_LEG_STANDING_CALF_RAISE",
      cable: "SINGLE_LEG_STANDING_CALF_RAISE",
    },
  ],
  "Single Leg Deadlift": [
    "dumbbell",
    {
      dumbbell: "SINGLE_LEG_DUMBBELL_ROMANIAN_DEADLIFTS",
      bodyweight: "SINGLE_LEG_BODYWEIGHT_ROMANIAN_DEADLIFTS",
      barbell: "SINGLE_LEG_BARBELL_ROMANIAN_DEADLIFTS",
      kettlebell: "SINGLE_LEG_ROMANIAN_DEADLIFTS",
    },
  ],
  "Single Leg Glute Bridge On Bench": ["bodyweight", { bodyweight: "SINGLE_LEG_GLUTE_BRIDGE" }],
  "Single Leg Glute Bridge Straight Leg": ["bodyweight", { bodyweight: "SINGLE_LEG_GLUTE_BRIDGE" }],
  "Single Leg Glute Bridge Bent Knee": ["bodyweight", { bodyweight: "SINGLE_LEG_GLUTE_BRIDGE" }],
  "Single Leg Hip Thrust": [
    "bodyweight",
    {
      barbell: "BARBELL_SINGLE_LEG_HIP_THRUST",
      bodyweight: "SINGLE_LEG_HIP_RAISE",
      leverageMachine: "MACHINE_SINGLE_LEG_HIP_THRUST",
      dumbbell: "DUMBBELL_SINGLE_LEG_HIP_THRUST",
    },
  ],
  "Sissy Squat": ["bodyweight", { bodyweight: "SISSY_SQUAT" }],
  "Sit Up": ["bodyweight", { bodyweight: "SIT_UP_GENERIC", kettlebell: "SIT_UP_GENERIC" }],
  Skullcrusher: [
    "ezbar",
    { barbell: "SKULL_CRUSHER", cable: "SKULL_CRUSHER", dumbbell: "DUMBBELL_SKULLCRUSHER", ezbar: "SKULL_CRUSHER" },
  ],
  "Sling Shot Bench Press": ["barbell", { barbell: "BARBELL_BENCH_PRESS" }],
  Snatch: [
    "dumbbell",
    { dumbbell: "SINGLE_ARM_DUMBBELL_SNATCH", barbell: "BARBELL_SNATCH", kettlebell: "SINGLE_ARM_KETTLEBELL_SNATCH" },
  ],
  "Snatch Pull": ["barbell", { barbell: "OLYMPIC_LIFT_GENERIC" }],
  "Split Squat": [
    "dumbbell",
    { dumbbell: "DUMBBELL_SPLIT_SQUAT", barbell: "BARBELL_SPLIT_SQUAT", bodyweight: "STATIC_LUNGE" },
  ],
  "Split Jerk": ["barbell", { barbell: "BARBELL_SPLIT_JERK" }],
  Squat: [
    "barbell",
    {
      barbell: "BARBELL_BACK_SQUAT",
      dumbbell: "DUMBBELL_SQUAT",
      bodyweight: "AIR_SQUAT",
      smith: "SMITH_MACHINE_SQUAT",
      leverageMachine: "SQUAT_GENERIC",
      kettlebell: "KETTLEBELL_SQUAT",
    },
  ],
  "Squat Row": ["band", { band: "ROW_GENERIC" }],
  "Standing Calf Raise": [
    "dumbbell",
    {
      barbell: "STANDING_CALF_RAISE",
      dumbbell: "STANDING_CALF_RAISE",
      leverageMachine: "STANDING_CALF_RAISE",
      bodyweight: "STANDING_CALF_RAISE",
      cable: "STANDING_CALF_RAISE",
      smith: "STANDING_CALF_RAISE",
    },
  ],
  "Standing Row": ["cable", { cable: "ROW_GENERIC" }],
  "Standing Row Close Grip": ["cable", { cable: "ROW_GENERIC" }],
  "Standing Row Rear Delt With Rope": ["cable", { cable: "FACE_PULL" }],
  "Standing Row Rear Delt, Horizontal, With Rope": ["cable", { cable: "FACE_PULL" }],
  "Standing Row V-Bar": ["cable", { cable: "ROW_GENERIC" }],
  "Step up": ["dumbbell", { barbell: "BARBELL_STEP_UP", dumbbell: "STEP_UP", bodyweight: "STEP_UP", band: "STEP_UP" }],
  "Stiff Leg Deadlift": [
    "barbell",
    { barbell: "BARBELL_STRAIGHT_LEG_DEADLIFT", dumbbell: "STRAIGHT_LEG_DEADLIFT", band: "STRAIGHT_LEG_DEADLIFT" },
  ],
  "Straight Leg Deadlift": [
    "barbell",
    {
      barbell: "BARBELL_STRAIGHT_LEG_DEADLIFT",
      dumbbell: "STRAIGHT_LEG_DEADLIFT",
      band: "STRAIGHT_LEG_DEADLIFT",
      kettlebell: "KB_STRAIGHT_LEG_DEADLIFT",
    },
  ],
  "Sumo Deadlift": ["barbell", { barbell: "SUMO_DEADLIFT" }],
  "Sumo Deadlift High Pull": ["barbell", { barbell: "BARBELL_HIGH_PULL" }],
  Superman: ["bodyweight", { bodyweight: "SUPERMAN_FROM_FLOOR", dumbbell: "SUPERMAN_FROM_FLOOR" }],
  "T Bar Row": ["leverageMachine", { leverageMachine: "T_BAR_ROW", barbell: "T_BAR_ROW" }],
  Thruster: ["barbell", { barbell: "THRUSTERS", dumbbell: "DUMBBELL_THRUSTERS", kettlebell: "THRUSTERS" }],
  "Toes To Bar": ["bodyweight", { bodyweight: "TOES_TO_BAR" }],
  "Torso Rotation": ["bodyweight", { bodyweight: "CHOP_GENERIC", cable: "CHOP_GENERIC" }],
  "Trap Bar Deadlift": ["trapbar", { trapbar: "TRAP_BAR_DEADLIFT" }],
  "Triceps Dip": ["bodyweight", { bodyweight: "TRICEP_DIP", leverageMachine: "SEATED_DIP_MACHINE" }],
  "Triceps Extension": [
    "dumbbell",
    {
      barbell: "SEATED_BARBELL_OVERHEAD_TRICEPS_EXTENSION",
      cable: "CABLE_OVERHEAD_TRICEPS_EXTENSION",
      band: "TRICEPS_EXTENSION_GENERIC",
      dumbbell: "OVERHEAD_DUMBBELL_TRICEPS_EXTENSION",
      ezbar: "SEATED_BARBELL_OVERHEAD_TRICEPS_EXTENSION",
      leverageMachine: "MACHINE_TRICEP_EXTENSION",
    },
  ],
  "Triceps Pushdown": ["cable", { cable: "TRICEPS_PRESSDOWN", band: "TRICEPS_PRESSDOWN" }],
  "Upright Row": [
    "dumbbell",
    {
      barbell: "BARBELL_UPRIGHT_ROW",
      cable: "CABLE_UPRIGHT_ROW",
      dumbbell: "BARBELL_UPRIGHT_ROW",
      band: "BARBELL_UPRIGHT_ROW",
      kettlebell: "KETTLEBELL_UPRIGHT_ROW",
      ezbar: "BARBELL_UPRIGHT_ROW",
    },
  ],
  "V Up": ["bodyweight", { bodyweight: "V_UP", band: "V_UP", dumbbell: "V_UP" }],
  "Wide Pull Up": ["bodyweight", { bodyweight: "WIDE_PULL_UP" }],
  "Wrist Curl": ["barbell", { barbell: "BARBELL_WRIST_CURL", dumbbell: "DUMBBELL_WRIST_CURL" }],
  "Wrist Roller": ["bodyweight", { bodyweight: "WRIST_ROLLER" }],
  "Zercher Squat": ["barbell", { barbell: "ZERCHER_SQUAT" }],
  "Wall Push Up": ["bodyweight", { bodyweight: "WALL_PUSH_UP" }],
  "Incline Push Up": ["bodyweight", { bodyweight: "INCLINE_PUSH_UP" }],
  "Knee Push Up": ["bodyweight", { bodyweight: "MODIFIED_PUSH_UP" }],
  "Diamond Push Up": ["bodyweight", { bodyweight: "DIAMOND_PUSH_UP" }],
  "Pseudo Planche Push Up": ["bodyweight", { bodyweight: "PUSH_UP_GENERIC" }],
  "Pike Push Up": ["bodyweight", { bodyweight: "PIKE_PUSH_UP" }],
  "Ring Dip": ["bodyweight", { bodyweight: "RING_DIP" }],
  "Negative Dip": ["bodyweight", { bodyweight: "BODY_WEIGHT_DIP" }],
  "Vertical Row": ["bodyweight", { bodyweight: "INVERTED_ROW" }],
  "Wide Row": ["bodyweight", { bodyweight: "INVERTED_ROW" }],
  "Ring Row": ["bodyweight", { bodyweight: "RING_ROW" }],
  "Tuck Front Lever Row": ["bodyweight", { bodyweight: "ROW_GENERIC" }],
  "Front Lever Row": ["bodyweight", { bodyweight: "ROW_GENERIC" }],
  "Scapular Pull Up": ["bodyweight", { bodyweight: "PULL_UP_GENERIC" }],
  "Dead Hang": ["bodyweight", { bodyweight: "DEAD_HANG" }],
  "Negative Pull Up": ["bodyweight", { bodyweight: "NEGATIVE_PULL_UP" }],
  "Assisted Squat": ["bodyweight", { bodyweight: "AIR_SQUAT" }],
  "Shrimp Squat": ["bodyweight", { bodyweight: "SQUAT_GENERIC" }],
  "Nordic Curl": ["bodyweight", { bodyweight: "NORDIC_CURL" }],
  Handstand: ["bodyweight", { bodyweight: "HANDSTAND_HOLD" }],
  "Wall Handstand": ["bodyweight", { bodyweight: "HANDSTAND_HOLD" }],
  "Crow Pose": ["bodyweight", { bodyweight: "CORE_GENERIC" }],
  "Dragon Flag": ["bodyweight", { bodyweight: "DRAGON_FLAG" }],
  "Copenhagen Plank": ["bodyweight", { bodyweight: "LL_COPENHAGEN_PLANK" }],
  "Hanging Knee Raise": ["bodyweight", { bodyweight: "HANGING_KNEE_RAISE" }],
  "Arch Hang": ["bodyweight", { bodyweight: "DEAD_HANG" }],
  "Support Hold": ["bodyweight", { bodyweight: "BAR_HOLDS" }],
  "Pallof Press": ["band", { band: "PALLOF_PRESS", cable: "PALLOF_PRESS" }],
  "Renegade Row": ["dumbbell", { dumbbell: "RENEGADE_ROW", kettlebell: "RENEGADE_ROW" }],
};

const BUILT_IN_BY_NAME = new Map(Object.entries(BUILT_IN).map(([name, entry]) => [name.toLowerCase(), entry]));

const EQUIPMENT_BY_NAME: Record<string, Equipment> = {
  barbell: "barbell",
  cable: "cable",
  dumbbell: "dumbbell",
  "smith machine": "smith",
  band: "band",
  kettlebell: "kettlebell",
  bodyweight: "bodyweight",
  "leverage machine": "leverageMachine",
  "medicine ball": "medicineball",
  "ez bar": "ezbar",
  "trap bar": "trapbar",
};

// How Strava spells the equipment inside exercise types, e.g. MACHINE_CHEST_PRESS.
const STRAVA_EQUIPMENT: Record<Equipment, string> = {
  barbell: "BARBELL",
  cable: "CABLE",
  dumbbell: "DUMBBELL",
  smith: "SMITH_MACHINE",
  band: "BANDED",
  kettlebell: "KETTLEBELL",
  bodyweight: "BODY_WEIGHT",
  leverageMachine: "MACHINE",
  medicineball: "MEDICINE_BALL",
  ezbar: "EZ_BAR",
  trapbar: "TRAP_BAR",
};

// Last resort for custom exercises: keywords that point at a Strava category. Order matters.
const GUESSES: [RegExp, string][] = [
  [/nordic|leg curl|hamstring curl/i, "LEG_CURL_GENERIC"],
  [/calf|calves/i, "CALF_RAISE_GENERIC"],
  [/curl/i, "CURL_GENERIC"],
  [/hip thrust|bridge/i, "HIP_RAISE_GENERIC"],
  [/abduct|adduct|clam|glute kickback|donkey kick|fire hydrant/i, "HIP_STABILITY_GENERIC"],
  [/tricep|pushdown|pressdown|skull ?crusher|kickback|\bdips?\b/i, "TRICEPS_EXTENSION_GENERIC"],
  [/rear delt|reverse fl|lateral raise|side raise|front raise/i, "LATERAL_RAISE_GENERIC"],
  [/\bfl(y|ye|ies|yes)\b|crossover|pec deck/i, "FLYE_GENERIC"],
  [/bench|chest press|floor press/i, "BENCH_PRESS_GENERIC"],
  [/shoulder press|overhead press|military press|\bohp\b|push press|arnold/i, "SHOULDER_PRESS_GENERIC"],
  [/shrug|upright row/i, "SHRUG_GENERIC"],
  [/pulldown|pull[- ]?ups?\b|chin[- ]?ups?\b/i, "PULL_UP_GENERIC"],
  [/push[- ]?ups?\b|press[- ]?ups?\b/i, "PUSH_UP_GENERIC"],
  [/\brows?\b|face pull/i, "ROW_GENERIC"],
  [/deadlift|\brdl\b/i, "DEADLIFT_GENERIC"],
  [/lunge|split squat|step[- ]?up/i, "LUNGE_GENERIC"],
  [/squat|leg press/i, "SQUAT_GENERIC"],
  [/back extension|hyperextension/i, "HYPEREXTENSION_GENERIC"],
  [/leg raise|knee raise|toes to bar/i, "LEG_RAISE_GENERIC"],
  [/plank/i, "PLANK_GENERIC"],
  [/sit[- ]?ups?\b|v[- ]?ups?\b/i, "SIT_UP_GENERIC"],
  [/crunch|\babs?\b|core|twist|rollout|ab wheel|dead ?bug|hollow/i, "CORE_GENERIC"],
  [/clean|snatch|jerk/i, "OLYMPIC_LIFT_GENERIC"],
  [/swing/i, "HIP_SWING_GENERIC"],
  [/carry|farmer|suitcase/i, "CARRY_GENERIC"],
  [/chop/i, "CHOP_GENERIC"],
  [/jump|plyo|slam|bound/i, "PLYO_GENERIC"],
  [/burpee|thruster|get[- ]?up/i, "TOTAL_BODY_GENERIC"],
];

/** Mapping value that leaves an exercise out of the Strava activity. */
export const SKIP = "SKIP";

export type MappingSource = "exercise-map.json" | "built-in" | "name match" | "guess";

export interface Mapping {
  type: string;
  source: MappingSource;
}

export type ExerciseMap = ReadonlyMap<string, string>;

export function loadExerciseMap(path: string): { map: ExerciseMap; warnings: string[] } {
  let raw: unknown;
  try {
    raw = readJson(path) ?? {};
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${(error as Error).message}`);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`${path} must be a JSON object of "Liftosaur exercise name": "STRAVA_EXERCISE_TYPE"`);
  }
  const map = new Map<string, string>();
  const warnings: string[] = [];
  for (const [name, value] of Object.entries(raw)) {
    if (name.startsWith("//")) {
      continue;
    }
    if (typeof value !== "string") {
      throw new Error(`${path}: the value for "${name}" must be a string`);
    }
    const type = value.trim().toUpperCase();
    if (type !== SKIP && !STRAVA_EXERCISE_TYPES.has(type)) {
      warnings.push(`${path}: "${value}" (for "${name}") is not a known Strava exercise type, see \`npm run types\``);
    }
    map.set(name.trim().toLowerCase(), type);
  }
  return { map, warnings };
}

export function resolveExercise(name: string, exerciseMap: ExerciseMap): Mapping | undefined {
  const fromMap = exerciseMap.get(name.trim().toLowerCase());
  if (fromMap) {
    return { type: fromMap, source: "exercise-map.json" };
  }

  const { base, equipmentName } = splitName(name);
  const equipment = equipmentName === undefined ? undefined : EQUIPMENT_BY_NAME[equipmentName.toLowerCase()];
  const builtIn = BUILT_IN_BY_NAME.get(base.toLowerCase());
  if (builtIn) {
    const [defaultEquipment, types] = builtIn;
    const defaultType = (defaultEquipment && types[defaultEquipment]) ?? Object.values(types)[0]!;
    if (equipmentName === undefined) {
      return { type: defaultType, source: "built-in" };
    }
    const exact = equipment && types[equipment];
    // Custom or unusual equipment for a built-in exercise falls back to its default variant.
    return exact ? { type: exact, source: "built-in" } : { type: defaultType, source: "guess" };
  }

  const matched = matchStravaName(base, equipment ? STRAVA_EQUIPMENT[equipment] : equipmentName);
  if (matched) {
    return { type: matched, source: "name match" };
  }
  const guess = GUESSES.find(([pattern]) => pattern.test(name));
  return guess ? { type: guess[1], source: "guess" } : undefined;
}

/** "Bench Press, Dumbbell" → base "Bench Press", equipment "Dumbbell". Built-in names may contain commas. */
function splitName(name: string): { base: string; equipmentName?: string } {
  const trimmed = name.trim();
  const comma = trimmed.lastIndexOf(",");
  if (comma < 0 || BUILT_IN_BY_NAME.has(trimmed.toLowerCase())) {
    return { base: trimmed };
  }
  return { base: trimmed.slice(0, comma).trim(), equipmentName: trimmed.slice(comma + 1).trim() };
}

/** Custom exercises are often named like Strava's own types, e.g. "Pendulum Squat" → PENDULUM_SQUAT. */
function matchStravaName(base: string, equipment: string | undefined): string | undefined {
  const name = toStravaCase(base);
  const candidates = equipment ? [`${toStravaCase(equipment)}_${name}`, name] : [name];
  for (const candidate of candidates) {
    for (const variant of [candidate, `${candidate}S`, candidate.replace(/S$/, "")]) {
      if (STRAVA_EXERCISE_TYPES.has(variant)) {
        return variant;
      }
    }
  }
  return undefined;
}

function toStravaCase(text: string): string {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** For tests: every built-in exercise name with the Strava types it can map to. */
export function builtInExercises(): [name: string, types: string[]][] {
  return Object.entries(BUILT_IN).map(([name, [, types]]) => [name, Object.values(types)]);
}
