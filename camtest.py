import cv2

# ----------- کد تست ساده دوربین با ذخیره تصویر -----------
def find_available_camera():
    for i in range(5):
        cap = cv2.VideoCapture(i)
        if cap.isOpened():
            cap.release()
            return i
    return -1

camera_index = find_available_camera()
if camera_index == -1:
    print("No camera found.")
    exit()

cap = cv2.VideoCapture(camera_index)
print("Camera detected at port", camera_index)

saved = False

while True:
    ret, frame = cap.read()
    if not ret:
        print("Failed to read frame from camera")
        break

    # نمایش فریم
    cv2.imshow("Test Camera Frame", frame)

    # ذخیره یک فریم فقط یک‌بار برای بررسی
    if not saved:
        cv2.imwrite("test_camera_frame.jpg", frame)
        print("Frame saved as test_camera_frame.jpg")
        saved = True

    if cv2.waitKey(1) == 27:  # ESC
        break

cap.release()
cv2.destroyAllWindows()