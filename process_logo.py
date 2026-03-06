import cv2
import numpy as np

def make_transparent():
    # Load image with alpha channel if possible, else just color
    img = cv2.imread('public/cit_logo_wide.png', cv2.IMREAD_UNCHANGED)
    if img is None:
        print("Logo not found at public/cit_logo_wide.png")
        return

    # If already has alpha channel, create a mask based on RGB
    if img.shape[2] == 4:
        # Separate channels
        b, g, r, a = cv2.split(img)
        rgb_img = cv2.merge([b, g, r])
    else:
        rgb_img = img
        b, g, r = cv2.split(img)
        a = np.ones(b.shape, dtype=b.dtype) * 255

    # Target the white/yellow background. Light colors.
    # Convert to HSV to better isolate yellow/white
    hsv = cv2.cvtColor(rgb_img, cv2.COLOR_BGR2HSV)
    
    # Yellow and White usually have high Value (brightness) and low-to-medium Saturation
    # Yellow hue is ~20-40 in opencv (which uses 0-179 for hue)
    # White has very low saturation
    
    # We want to keep the dark blue text and butterfly, and the green box at bottom left
    # Blue: Hue ~110-130
    # Green: Hue ~40-80
    
    # Let's instead mask out anything that is *not* dark (text/butterfly) and *not* green (box)
    
    # Dark blue mask
    lower_blue = np.array([100, 50, 0])
    upper_blue = np.array([140, 255, 150])
    mask_blue = cv2.inRange(hsv, lower_blue, upper_blue)
    
    # Green box mask
    lower_green = np.array([35, 50, 50])
    upper_green = np.array([85, 255, 255])
    mask_green = cv2.inRange(hsv, lower_green, upper_green)

    # Dark colors in general (for black/dark text)
    # Value < 100
    mask_dark = cv2.inRange(hsv, np.array([0, 0, 0]), np.array([180, 255, 100]))

    # Combine masks of what we want to KEEP
    keep_mask = cv2.bitwise_or(mask_blue, cv2.bitwise_or(mask_green, mask_dark))
    
    # Smooth the mask
    kernel = np.ones((3,3), np.uint8)
    keep_mask = cv2.morphologyEx(keep_mask, cv2.MORPH_CLOSE, kernel)

    # Let's try a simpler approach since the background is just solid yellow and white
    # Yellow background: H ~ 20-35, S > 100, V > 200
    lower_yellow = np.array([20, 100, 200])
    upper_yellow = np.array([40, 255, 255])
    yellow_mask = cv2.inRange(hsv, lower_yellow, upper_yellow)

    # White background: S < 30, V > 200
    lower_white = np.array([0, 0, 200])
    upper_white = np.array([180, 30, 255])
    white_mask = cv2.inRange(hsv, lower_white, upper_white)

    # Background to remove
    remove_mask = cv2.bitwise_or(yellow_mask, white_mask)
    
    # Dilate remove mask slightly to get rid of yellow/white fringes
    remove_mask = cv2.dilate(remove_mask, kernel, iterations=1)

    # Apply alpha
    # Where remove_mask is > 0, set alpha to 0
    a[remove_mask > 0] = 0

    # There's also some text that might be grey or other colors, so removing yellow+white is safer than keeping specific colors.

    # Merge channels back
    result = cv2.merge([b, g, r, a])
    
    cv2.imwrite('public/cit_logo_transparent.png', result)
    print("Saved transparent logo.")

if __name__ == "__main__":
    make_transparent()
